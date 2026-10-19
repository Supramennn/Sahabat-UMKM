import type { FastifyInstance } from 'fastify'
import type { Database, Sql } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { ensureFeature } from '../plans/service.ts'
import { createSale } from '../sales/service.ts'
import { StockError } from '../stock/movements.ts'
import {
  IMPORT_BODY_LIMIT,
  MAX_IMPORT_ROWS,
  importFileSchema,
  readImportFile,
} from './file.ts'
import { requireImportGate } from './gate.ts'
import { missingSalesHeaders, normalizeSalesHeader, validateSalesRows, type ValidSalesRow } from './sales-csv.ts'

/**
 * Impor penjualan (PRD 6.4 dan 6.8).
 *
 * Pratinjau tidak menulis apa pun. Commit berjalan penuh atau tidak sama sekali:
 * kalau satu baris bermasalah, tidak ada penjualan yang tersimpan dan tidak ada satu
 * pun baris ledger yang bergerak.
 *
 * Pembatalan impor (B-04) ada di modul riwayat impor bersama, karena aturannya sama
 * untuk semua jenis impor. Penjualan yang berasal dari impor dicatat di
 * import_job_sales, jadi pembatalan tahu baris mana tanpa menebak dari nomor.
 */

interface ResolvedRow {
  row: ValidSalesRow
  productId: number
  locationId: number
  customerId: number | null
}

/** Melihatkan semua masalah sekaligus, bukan berhenti di baris pertama. */
async function resolveRows(
  db: Sql,
  workspaceId: number,
  rows: ValidSalesRow[],
): Promise<{ resolved: ResolvedRow[]; problems: Array<{ rowNumber: number; message: string }> }> {
  const problems: Array<{ rowNumber: number; message: string }> = []
  const resolved: ResolvedRow[] = []

  const lokasiIds = new Map<string, number>()
  for (const name of new Set(rows.map((row) => row.locationName.toLowerCase()))) {
    const found = await db.query<{ id: string; name: string }>(
      'select id, name from locations where workspace_id = $1 and lower(name) = $2 and not is_archived',
      [workspaceId, name],
    )
    if (found.rows[0]) {
      lokasiIds.set(name, Number(found.rows[0].id))
    }
  }

  const pelangganIds = new Map<string, number>()
  for (const name of new Set(
    rows.map((row) => row.customerName).filter((value): value is string => value !== null),
  )) {
    const found = await db.query<{ id: string }>(
      'select id from customers where workspace_id = $1 and lower(name) = $2 and not is_archived',
      [workspaceId, name.toLowerCase()],
    )
    if (found.rows[0]) {
      pelangganIds.set(name.toLowerCase(), Number(found.rows[0].id))
    }
  }

  const skuIds = new Map<string, number>()
  for (const sku of new Set(rows.map((row) => row.sku.toLowerCase()))) {
    const found = await db.query<{ id: string }>(
      'select id from products where workspace_id = $1 and lower(sku) = $2',
      [workspaceId, sku],
    )
    if (found.rows[0]) {
      skuIds.set(sku, Number(found.rows[0].id))
    }
  }

  for (const row of rows) {
    const locationId = lokasiIds.get(row.locationName.toLowerCase())
    if (locationId === undefined) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Lokasi "${row.locationName}" tidak ada di workspace ini. Tambahkan lokasinya dulu di Pengaturan.`,
      })
      continue
    }

    const productId = skuIds.get(row.sku.toLowerCase())
    if (productId === undefined) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `SKU "${row.sku}" tidak ada. Baris ini butuh barang yang sudah terdaftar.`,
      })
      continue
    }

    let customerId: number | null = null
    if (row.customerName) {
      const ditemukan = pelangganIds.get(row.customerName.toLowerCase())
      if (ditemukan === undefined) {
        problems.push({
          rowNumber: row.rowNumber,
          message: `Pelanggan "${row.customerName}" tidak ada. Tambahkan pelanggan dulu, atau kosongkan kolomnya.`,
        })
        continue
      }
      customerId = ditemukan
    }

    resolved.push({ row, productId, locationId, customerId })
  }

  return { resolved, problems }
}

export function registerSalesImportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.post(
    '/api/workspaces/:workspaceId/imports/sales/preview',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeSalesHeader)

      const missing = missingSalesHeaders(file.parsed.headers)

      if (missing.length > 0) {
        return reply.code(400).send({
          error: 'kolom_wajib_kurang',
          message: `Kolom wajib belum ada: ${missing.join(', ')}. Unduh template untuk melihat contoh.`,
          missingHeaders: missing,
          detectedHeaders: file.parsed.headers,
        })
      }

      if (file.parsed.problems.length > 0) {
        return reply.code(400).send({
          error: 'baris_tidak_bisa_dibaca',
          message: `Ada ${file.parsed.problems.length} baris yang jumlah kolomnya tidak sama dengan header.`,
          problems: file.parsed.problems.slice(0, 100),
        })
      }

      if (file.parsed.rows.length > MAX_IMPORT_ROWS) {
        return reply.code(400).send({
          error: 'melebihi_batas_baris',
          message:
            `Satu impor maksimal ${MAX_IMPORT_ROWS} baris, dan berkas ini berisi ` +
            `${file.parsed.rows.length} baris. Pecah berkasnya menjadi beberapa bagian.`,
          maxRowsPerImport: MAX_IMPORT_ROWS,
        })
      }

      const validation = validateSalesRows(file.parsed.rows)
      const { resolved, problems } = await resolveRows(db, context.workspaceId, validation.valid)

      return reply.code(200).send({
        totalRows: file.parsed.rows.length,
        validRows: resolved.length,
        problemRows: validation.problems.length + problems.length,
        problems: [...validation.problems, ...problems].slice(0, 100),
        sample: resolved.slice(0, 10).map((item) => ({
          rowNumber: item.row.rowNumber,
          soldOn: item.row.soldOn,
          sku: item.row.sku,
          quantity: item.row.quantity,
          unitPrice: item.row.unitPrice,
        })),
        maxRowsPerImport: MAX_IMPORT_ROWS,
        exceedsRowLimit: false,
      })
    },
  )

  app.post(
    '/api/workspaces/:workspaceId/imports/sales',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeSalesHeader)

      const missing = missingSalesHeaders(file.parsed.headers)
      if (missing.length > 0) {
        return reply.code(400).send({
          error: 'kolom_wajib_kurang',
          message: `Kolom wajib belum ada: ${missing.join(', ')}.`,
          missingHeaders: missing,
        })
      }

      if (file.parsed.rows.length > MAX_IMPORT_ROWS) {
        return reply.code(400).send({
          error: 'melebihi_batas_baris',
          message: `Satu impor maksimal ${MAX_IMPORT_ROWS} baris. Pecah berkasnya menjadi beberapa bagian.`,
          maxRowsPerImport: MAX_IMPORT_ROWS,
        })
      }

      const validation = validateSalesRows(file.parsed.rows)
      const { resolved, problems } = await resolveRows(db, context.workspaceId, validation.valid)
      const semuaMasalah = [...validation.problems, ...problems]

      if (semuaMasalah.length > 0) {
        return reply.code(400).send({
          error: semuaMasalah.length === file.parsed.rows.length ? 'tidak_ada_baris_valid' : 'impor_berhenti',
          message:
            `Impor tidak dijalankan karena ${semuaMasalah.length} baris bermasalah. ` +
            'Perbaiki baris itu lalu impor ulang. Tidak ada data yang tersimpan.',
          problems: semuaMasalah.slice(0, 100),
        })
      }

      const contentHash = file.contentHash

      interface SalesImportBody {
        importJobId: number
        imported: number
        firstNumber: string | null
        lastNumber: string | null
        totalAmount: number
      }

      const hasil: SalesImportBody & { replayed: boolean } = await db.transaction(async (tx) => {
        await ensureFeature(tx, context.workspaceId, 'sales')
        const ulangan = await tx.query<{ response_body: SalesImportBody | null }>(
          `select response_body from idempotency_keys
            where workspace_id = $1 and operation = 'import.sales' and key = $2`,
          [context.workspaceId, input.idempotencyKey],
        )
        if (ulangan.rows[0]) {
          return { replayed: true, ...(ulangan.rows[0].response_body as SalesImportBody) }
        }

        const sudahAda = await tx.query(
          'select 1 from import_jobs where workspace_id = $1 and kind = $2 and content_hash = $3 and cancelled_at is null',
          [context.workspaceId, 'penjualan', contentHash],
        )
        if (sudahAda.rows.length > 0) {
          throw new StockError(
            'berkas_sudah_diimpor',
            'Berkas yang sama sudah pernah diimpor dan belum dibatalkan. Buka riwayat impor untuk membatalkannya, atau ubah berkasnya sedikit.',
            409,
          )
        }

        await tx.query(
          `insert into idempotency_keys (workspace_id, operation, key, request_hash)
           values ($1, 'import.sales', $2, $3)`,
          [context.workspaceId, input.idempotencyKey, contentHash],
        )

        const job = await tx.query<{ id: string }>(
          `insert into import_jobs
             (workspace_id, kind, file_name, content_hash, total_rows, created_by)
           values ($1, 'penjualan', $2, $3, $4, $5)
           returning id`,
          [context.workspaceId, input.fileName ?? null, contentHash, resolved.length, context.userId],
        )
        const jobId = Number(job.rows[0]!.id)

        const saleIds: number[] = []
        const perBaris: Array<{ rowNumber: number; number: string; totalAmount: number }> = []

        for (let index = 0; index < resolved.length; index += 1) {
          const item = resolved[index]!
          // Kunci idempotency per baris. Kalau seluruh permintaan diulang, pemeriksa
          // idempotency_keys di atas sudah menangkalnya; ini menutup jalan lain ketika
          // satu baris gagal setelah beberapa baris sebelumnya tersimpan.
          const kunciBaris = `${input.idempotencyKey}:impor:${index + 1}`

          const sale = await createSale(tx, {
            workspaceId: context.workspaceId,
            actorUserId: context.userId,
            soldOn: item.row.soldOn,
            locationId: item.locationId,
            customerId: item.customerId,
            paymentMethodLabel: item.row.paymentMethodLabel,
            note: item.row.note,
            items: [
              {
                productId: item.productId,
                quantity: item.row.quantity,
                unitPrice: item.row.unitPrice,
                discountAmount: item.row.discountAmount,
              },
            ],
            idempotencyKey: kunciBaris,
          })

          saleIds.push(sale.saleId)
          perBaris.push({ rowNumber: item.row.rowNumber, number: sale.number, totalAmount: sale.totalAmount })
        }

        for (const saleId of saleIds) {
          await tx.query(
            'insert into import_job_sales (workspace_id, import_job_id, sale_id) values ($1, $2, $3)',
            [context.workspaceId, jobId, saleId],
          )
        }

        await tx.query(
          'update import_jobs set imported_rows = $2 where id = $1',
          [jobId, saleIds.length],
        )

        const body: SalesImportBody = {
          importJobId: jobId,
          imported: saleIds.length,
          firstNumber: perBaris[0]?.number ?? null,
          lastNumber: perBaris.at(-1)?.number ?? null,
          totalAmount: perBaris.reduce((total, item) => total + item.totalAmount, 0),
        }

        await tx.query(
          `update idempotency_keys set response_status = 201, response_body = $3, completed_at = now()
            where workspace_id = $1 and operation = 'import.sales' and key = $2`,
          [context.workspaceId, input.idempotencyKey, JSON.stringify(body)],
        )

        return { replayed: false, ...body }
      })

      if (!hasil.replayed) {
        await writeAudit(db, {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorRole: context.role,
          action: 'import.sales',
          objectType: 'import',
          objectId: String(hasil.importJobId),
          metadata: { imported: hasil.imported, totalAmount: hasil.totalAmount },
        })
      }

      return reply.code(201).send(hasil)
  })
}
