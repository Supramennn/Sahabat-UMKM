import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { StockError } from '../stock/movements.ts'
import { ensurePlanCapacity } from '../plans/service.ts'
import {
  IMPORT_BODY_LIMIT,
  MAX_IMPORT_ROWS,
  hasOpeningBalanceColumn,
  importFileSchema,
  readImportFile,
} from './file.ts'
import { requireImportGate } from './gate.ts'
import { missingHeaders, normalizeProductHeader, validateProductRows } from './products-csv.ts'

/**
 * Impor produk (PRD 6.8, skenario 1 PRD 3, A-01).
 *
 * Dua langkah yang sengaja dipisah: pratinjau dan commit. Pratinjau tidak menulis
 * apa pun, jadi pengguna bisa memperbaiki berkas sebelum ada data yang tersimpan.
 * Commit menyimpan semua baris atau tidak ada sama sekali, dan mencatat satu baris
 * import_jobs supaya hasilnya bisa dibatalkan dari riwayat impor (B-04).
 *
 * Batas paket diperiksa per baris lewat ensurePlanCapacity. A-01 meminta pesannya
 * menyebut angka batas dan cara menaikkan paket; itu bunyi planLimitMessage.
 */

interface ImportResultBody {
  importJobId: number
  imported: number
  skipped: number
  categoriesCreated: number
  skippedRows: Array<{ rowNumber: number; sku: string; message: string }>
}

export function registerImportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  /**
   * Pratinjau. Tidak menulis apa pun, hanya melaporkan jumlah baris valid, daftar
   * baris bermasalah beserta alasannya, dan nama kolom yang tidak dikenal.
   */
  app.post(
    '/api/workspaces/:workspaceId/imports/products/preview',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeProductHeader)

      const missing = missingHeaders(file.parsed.headers)
      if (missing.length > 0) {
        return reply.code(400).send({
          error: 'kolom_wajib_kurang',
          message: `Kolom wajib belum ada: ${missing.join(', ')}. Unduh template untuk melihat contoh.`,
          missingHeaders: missing,
          detectedHeaders: file.parsed.headers,
        })
      }

      if (hasOpeningBalanceColumn(file.parsed.headers)) {
        return reply.code(400).send(openingColumnError())
      }

      if (file.parsed.problems.length > 0) {
        return reply.code(400).send({
          error: 'baris_tidak_bisa_dibaca',
          message: `Ada ${file.parsed.problems.length} baris yang jumlah kolomnya tidak sama dengan header.`,
          problems: file.parsed.problems.slice(0, 100),
        })
      }

      const validation = validateProductRows(file.parsed.rows)

      return reply.code(200).send({
        totalRows: file.parsed.rows.length,
        validRows: validation.valid.length,
        problemRows: validation.problems.length,
        problems: validation.problems.slice(0, 100),
        // Sampel supaya pengguna bisa membandingkan isi berkasnya dengan yang akan
        // disimpan.
        sample: validation.valid.slice(0, 10),
        maxRowsPerImport: MAX_IMPORT_ROWS,
        exceedsRowLimit: file.parsed.rows.length > MAX_IMPORT_ROWS,
      })
    },
  )

  /**
   * Commit. Semua baris valid disimpan dalam satu transaksi; kalau satu baris
   * gagal, tidak ada baris yang tersimpan (PRD 6.8).
   */
  app.post(
    '/api/workspaces/:workspaceId/imports/products',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeProductHeader)

      const missing = missingHeaders(file.parsed.headers)
      if (missing.length > 0) {
        return reply.code(400).send({
          error: 'kolom_wajib_kurang',
          message: `Kolom wajib belum ada: ${missing.join(', ')}.`,
          missingHeaders: missing,
        })
      }

      if (hasOpeningBalanceColumn(file.parsed.headers)) {
        return reply.code(400).send(openingColumnError())
      }

      const validation = validateProductRows(file.parsed.rows)

      // Impor berjalan penuh atau tidak sama sekali. Kalau ada satu baris saja yang
      // bermasalah, tidak ada yang disimpan.
      if (validation.problems.length > 0) {
        return reply.code(400).send({
          error: validation.valid.length === 0 ? 'tidak_ada_baris_valid' : 'impor_berhenti',
          message:
            `Impor tidak dijalankan karena ${validation.problems.length} baris bermasalah. ` +
            'Perbaiki baris itu lalu impor ulang. Tidak ada data yang tersimpan.',
          problems: validation.problems.slice(0, 100),
        })
      }

      if (validation.valid.length === 0) {
        return reply.code(400).send({
          error: 'tidak_ada_baris_valid',
          message: 'Berkas tidak berisi baris data. Isi minimal satu baris, lalu periksa lagi.',
        })
      }

      if (validation.valid.length > MAX_IMPORT_ROWS) {
        return reply.code(400).send({
          error: 'melebihi_batas_baris',
          message:
            `Satu impor maksimal ${MAX_IMPORT_ROWS} baris, dan berkas ini berisi ` +
            `${validation.valid.length} baris. Pecah berkasnya menjadi beberapa bagian.`,
          maxRowsPerImport: MAX_IMPORT_ROWS,
        })
      }

      const hasil: ImportResultBody & { replayed: boolean } = await db.transaction(async (tx) => {
        const ulangan = await tx.query<{ response_body: ImportResultBody | null }>(
          `select response_body from idempotency_keys
            where workspace_id = $1 and operation = 'import.products' and key = $2`,
          [context.workspaceId, input.idempotencyKey],
        )
        if (ulangan.rows[0]) {
          return { replayed: true, ...(ulangan.rows[0].response_body as ImportResultBody) }
        }

        const sudahAda = await tx.query(
          `select 1 from import_jobs
            where workspace_id = $1 and kind = 'produk' and content_hash = $2 and cancelled_at is null`,
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
           values ($1, 'import.products', $2, $3)`,
          [context.workspaceId, input.idempotencyKey, file.contentHash],
        )

        const job = await tx.query<{ id: string }>(
          `insert into import_jobs
             (workspace_id, kind, file_name, content_hash, total_rows, created_by)
           values ($1, 'produk', $2, $3, $4, $5)
           returning id`,
          [context.workspaceId, input.fileName ?? null, file.contentHash, validation.valid.length, context.userId],
        )
        const jobId = Number(job.rows[0]!.id)

        // Kategori dibuat dari nama yang muncul di berkas, lalu dipakai ulang. Dua
        // baris dengan kategori yang sama tidak membuat dua kategori.
        const categoryIds = new Map<string, number>()
        const kategoriNames = [...new Set(validation.valid.map((row) => row.categoryName).filter(
          (name): name is string => name !== null,
        ))]

        for (const name of kategoriNames) {
          const lower = name.toLowerCase()
          const ada = await tx.query<{ id: number }>(
            'select id from categories where workspace_id = $1 and lower(name) = $2',
            [context.workspaceId, lower],
          )
          if (ada.rows[0]) {
            categoryIds.set(lower, ada.rows[0].id)
            continue
          }
          const dibuat = await tx.query<{ id: number }>(
            'insert into categories (workspace_id, name) values ($1, $2) returning id',
            [context.workspaceId, name],
          )
          categoryIds.set(lower, dibuat.rows[0]!.id)
        }

        // SKU yang sudah ada di workspace tidak ditulis ulang. Impor bukan cara
        // mengubah barang lama, dan menimpa harga diam-diam akan merusak riwayat.
        const created: number[] = []
        const skipped: Array<{ rowNumber: number; sku: string; message: string }> = []

        for (const row of validation.valid) {
          const ada = await tx.query<{ id: number }>(
            'select id from products where workspace_id = $1 and lower(sku) = $2',
            [context.workspaceId, row.sku.toLowerCase()],
          )
          if (ada.rows[0]) {
            skipped.push({
              rowNumber: row.rowNumber,
              sku: row.sku,
              message: `SKU ${row.sku} sudah ada di workspace ini, jadi dilewati. Ubah SKU-nya kalau memang ingin ditambah.`,
            })
            continue
          }

          await ensurePlanCapacity(tx, context.workspaceId, 'produk')

          const inserted = await tx.query<{ id: number }>(
            `insert into products
               (workspace_id, category_id, sku, name, unit_code,
                reference_purchase_price, selling_price, min_stock)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             returning id`,
            [
              context.workspaceId,
              row.categoryName ? (categoryIds.get(row.categoryName.toLowerCase()) ?? null) : null,
              row.sku,
              row.name,
              row.unitCode,
              row.purchasePrice,
              row.sellingPrice,
              row.minStock,
            ],
          )
          const productId = inserted.rows[0]!.id

          await tx.query(
            'insert into product_costs (workspace_id, product_id) values ($1, $2)',
            [context.workspaceId, productId],
          )

          await tx.query(
            'insert into import_job_products (workspace_id, import_job_id, product_id) values ($1, $2, $3)',
            [context.workspaceId, jobId, productId],
          )

          created.push(productId)
        }

        await tx.query('update import_jobs set imported_rows = $2, skipped_rows = $3 where id = $1', [
          jobId,
          created.length,
          skipped.length,
        ])

        const body: ImportResultBody = {
          importJobId: jobId,
          imported: created.length,
          skipped: skipped.length,
          categoriesCreated: kategoriNames.length,
          skippedRows: skipped.slice(0, 100),
        }

        await tx.query(
          `update idempotency_keys set response_status = 201, response_body = $3, completed_at = now()
            where workspace_id = $1 and operation = 'import.products' and key = $2`,
          [context.workspaceId, input.idempotencyKey, JSON.stringify(body)],
        )

        return { replayed: false, ...body }
      })

      if (!hasil.replayed) {
        await writeAudit(db, {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorRole: context.role,
          action: 'import.products',
          objectType: 'import',
          objectId: String(hasil.importJobId),
          metadata: {
            imported: hasil.imported,
            skipped: hasil.skipped,
          },
        })
      }

      return reply.code(201).send(hasil)
    },
  )
}

function openingColumnError(): {
  error: string
  message: string
} {
  return {
    error: 'kolom_stok_awal',
    message:
      'Kolom stok awal tidak diimpor dari berkas barang. Impor saldo awal lewat halaman Impor saldo awal, ' +
      'karena saldo awal butuh kolom lokasi dan tercatat sebagai riwayat stok.',
  }
}
