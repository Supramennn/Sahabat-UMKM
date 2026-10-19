import type { FastifyInstance } from 'fastify'
import type { Database, Sql } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { reasonCodes, recordMovement, StockError } from '../stock/movements.ts'
import { todayInWorkspace, toDateString } from '../purchasing/documents.ts'
import { IMPORT_BODY_LIMIT, MAX_IMPORT_ROWS, importFileSchema, readImportFile } from './file.ts'
import { requireImportGate } from './gate.ts'
import {
  missingOpeningHeaders,
  normalizeOpeningHeader,
  validateOpeningRows,
  type ValidOpeningRow,
} from './opening-csv.ts'

/**
 * Impor saldo awal (PRD 6.8).
 *
 * Baris valid disimpan sebagai transaksi stok masuk beralasan saldo_awal, lewat
 * jalur ledger yang sama dengan input stok lain, jadi saldo, lot, dan harga pokok
 * rata-rata bergerak ikut aturan yang sudah ada. Impor berjalan penuh atau tidak
 * sama sekali: satu baris bermasalah membatalkan seluruh berkas.
 *
 * Pembatalannya (B-04) membuat baris pembalik, bukan menghapus ledger.
 */

interface ResolvedRow {
  row: ValidOpeningRow
  productId: number
  locationId: number
}

/** Melihatkan semua masalah sekaligus, bukan berhenti di baris pertama. */
async function resolveRows(
  db: Sql,
  workspaceId: number,
  rows: ValidOpeningRow[],
): Promise<{ resolved: ResolvedRow[]; problems: Array<{ rowNumber: number; message: string }> }> {
  const problems: Array<{ rowNumber: number; message: string }> = []
  const resolved: ResolvedRow[] = []

  const produk = new Map<string, { id: number; name: string; status: string }>()
  for (const sku of new Set(rows.map((row) => row.sku.toLowerCase()))) {
    const found = await db.query<{ id: string; name: string; status: string }>(
      'select id::text, name, status from products where workspace_id = $1 and lower(sku) = $2',
      [workspaceId, sku],
    )
    const row = found.rows[0]
    if (row) {
      produk.set(sku, { id: Number(row.id), name: row.name, status: row.status })
    }
  }

  const lokasi = new Map<string, number>()
  for (const name of new Set(rows.map((row) => row.locationName.toLowerCase()))) {
    const found = await db.query<{ id: string }>(
      'select id from locations where workspace_id = $1 and lower(name) = $2 and not is_archived',
      [workspaceId, name],
    )
    if (found.rows[0]) {
      lokasi.set(name, Number(found.rows[0].id))
    }
  }

  for (const row of rows) {
    const locationId = lokasi.get(row.locationName.toLowerCase())
    if (locationId === undefined) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Lokasi "${row.locationName}" tidak ada di workspace ini. Tambahkan lokasinya dulu di Pengaturan.`,
      })
      continue
    }

    const product = produk.get(row.sku.toLowerCase())
    if (!product) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `SKU "${row.sku}" belum terdaftar. Impor barangnya dulu lewat halaman Impor barang.`,
      })
      continue
    }
    if (product.status === 'diarsipkan') {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Produk ${product.name} sudah diarsipkan, jadi tidak bisa diberi saldo awal baru.`,
      })
      continue
    }

    resolved.push({ row, productId: product.id, locationId })
  }

  return { resolved, problems }
}

export function registerOpeningImportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.post(
    '/api/workspaces/:workspaceId/imports/opening-balances/preview',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeOpeningHeader)

      const missing = missingOpeningHeaders(file.parsed.headers)
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

      const validation = validateOpeningRows(file.parsed.rows)
      const { resolved, problems } = await resolveRows(db, context.workspaceId, validation.valid)

      return reply.code(200).send({
        totalRows: file.parsed.rows.length,
        validRows: resolved.length,
        problemRows: validation.problems.length + problems.length,
        problems: [...validation.problems, ...problems].slice(0, 100),
        sample: resolved.slice(0, 10).map((item) => ({
          rowNumber: item.row.rowNumber,
          sku: item.row.sku,
          locationName: item.row.locationName,
          quantity: item.row.quantity,
          unitCost: item.row.unitCost,
          occurredOn: item.row.occurredOn,
        })),
        maxRowsPerImport: MAX_IMPORT_ROWS,
        exceedsRowLimit: file.parsed.rows.length > MAX_IMPORT_ROWS,
      })
    },
  )

  app.post(
    '/api/workspaces/:workspaceId/imports/opening-balances',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeOpeningHeader)

      const missing = missingOpeningHeaders(file.parsed.headers)
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

      const validation = validateOpeningRows(file.parsed.rows)
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

      if (resolved.length === 0) {
        return reply.code(400).send({
          error: 'tidak_ada_baris_valid',
          message: 'Berkas tidak berisi baris data. Isi minimal satu baris, lalu periksa lagi.',
        })
      }

      interface OpeningImportBody {
        importJobId: number
        imported: number
        totalQuantity: number
      }

      const hasil: OpeningImportBody & { replayed: boolean } = await db.transaction(async (tx) => {
        const ulangan = await tx.query<{ response_body: OpeningImportBody | null }>(
          `select response_body from idempotency_keys
            where workspace_id = $1 and operation = 'import.opening_balances' and key = $2`,
          [context.workspaceId, input.idempotencyKey],
        )
        if (ulangan.rows[0]) {
          return { replayed: true, ...(ulangan.rows[0].response_body as OpeningImportBody) }
        }

        const sudahAda = await tx.query(
          `select 1 from import_jobs
            where workspace_id = $1 and kind = 'saldo_awal' and content_hash = $2 and cancelled_at is null`,
          [context.workspaceId, file.contentHash],
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
           values ($1, 'import.opening_balances', $2, $3)`,
          [context.workspaceId, input.idempotencyKey, file.contentHash],
        )

        const job = await tx.query<{ id: string }>(
          `insert into import_jobs
             (workspace_id, kind, file_name, content_hash, total_rows, created_by)
           values ($1, 'saldo_awal', $2, $3, $4, $5)
           returning id`,
          [context.workspaceId, input.fileName ?? null, file.contentHash, resolved.length, context.userId],
        )
        const jobId = Number(job.rows[0]!.id)

        const hariIni = toDateString(await todayInWorkspace(tx, context.workspaceId))
        let totalQuantity = 0

        for (let index = 0; index < resolved.length; index += 1) {
          const item = resolved[index]!

          const movement = await recordMovement(tx, {
            workspaceId: context.workspaceId,
            productId: item.productId,
            locationId: item.locationId,
            kind: 'masuk',
            direction: 'tambah',
            quantity: item.row.quantity,
            unitCost: item.row.unitCost,
            reasonCode: reasonCodes.saldoAwal,
            occurredOn: item.row.occurredOn ?? hariIni,
            actorUserId: context.userId,
            idempotencyKey: `${input.idempotencyKey}:impor:${index + 1}`,
          })

          await tx.query(
            `insert into import_job_stock_movements (workspace_id, import_job_id, stock_movement_id)
             values ($1, $2, $3)`,
            [context.workspaceId, jobId, movement.movementId],
          )
          totalQuantity += item.row.quantity
        }

        await tx.query('update import_jobs set imported_rows = $2 where id = $1', [
          jobId,
          resolved.length,
        ])

        const body: OpeningImportBody = {
          importJobId: jobId,
          imported: resolved.length,
          totalQuantity: Number(totalQuantity.toFixed(4)),
        }

        await tx.query(
          `update idempotency_keys set response_status = 201, response_body = $3, completed_at = now()
            where workspace_id = $1 and operation = 'import.opening_balances' and key = $2`,
          [context.workspaceId, input.idempotencyKey, JSON.stringify(body)],
        )

        return { replayed: false, ...body }
      })

      if (!hasil.replayed) {
        await writeAudit(db, {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorRole: context.role,
          action: 'import.opening_balances',
          objectType: 'import',
          objectId: String(hasil.importJobId),
          metadata: { imported: hasil.imported, totalQuantity: hasil.totalQuantity },
        })
      }

      return reply.code(201).send(hasil)
    },
  )
}
