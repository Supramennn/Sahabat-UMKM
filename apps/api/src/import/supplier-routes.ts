import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { StockError } from '../stock/movements.ts'
import { IMPORT_BODY_LIMIT, MAX_IMPORT_ROWS, importFileSchema, readImportFile } from './file.ts'
import { requireImportGate } from './gate.ts'
import {
  missingSupplierHeaders,
  normalizeSupplierHeader,
  validateSupplierRows,
} from './suppliers-csv.ts'

/**
 * Impor supplier (PRD 6.8).
 *
 * Dua langkah seperti impor lain: pratinjau tidak menulis apa pun, commit menyimpan
 * semua baris atau tidak ada sama sekali. Supplier yang namanya sudah ada dilewati,
 * bukan ditulis ulang, karena menimpa data supplier lama diam-diam akan mengubah
 * arti dokumen pembelian yang menyebutnya.
 */

interface ImportResultBody {
  importJobId: number
  imported: number
  skipped: number
  skippedRows: Array<{ rowNumber: number; name: string; message: string }>
}

export function registerSupplierImportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.post(
    '/api/workspaces/:workspaceId/imports/suppliers/preview',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeSupplierHeader)

      const missing = missingSupplierHeaders(file.parsed.headers)
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

      const validation = validateSupplierRows(file.parsed.rows)

      return reply.code(200).send({
        totalRows: file.parsed.rows.length,
        validRows: validation.valid.length,
        problemRows: validation.problems.length,
        problems: validation.problems.slice(0, 100),
        sample: validation.valid.slice(0, 10).map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          contactName: row.contactName,
          phone: row.phone,
        })),
        maxRowsPerImport: MAX_IMPORT_ROWS,
        exceedsRowLimit: file.parsed.rows.length > MAX_IMPORT_ROWS,
      })
    },
  )

  app.post(
    '/api/workspaces/:workspaceId/imports/suppliers',
    { bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const context = await requireImportGate(db, request)
      const input = importFileSchema.parse(request.body)
      const file = await readImportFile(input, normalizeSupplierHeader)

      const missing = missingSupplierHeaders(file.parsed.headers)
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

      const validation = validateSupplierRows(file.parsed.rows)

      if (validation.problems.length > 0) {
        return reply.code(400).send({
          error:
            validation.valid.length === 0 ? 'tidak_ada_baris_valid' : 'impor_berhenti',
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

      const hasil: ImportResultBody & { replayed: boolean } = await db.transaction(async (tx) => {
        const ulangan = await tx.query<{ response_body: ImportResultBody | null }>(
          `select response_body from idempotency_keys
            where workspace_id = $1 and operation = 'import.suppliers' and key = $2`,
          [context.workspaceId, input.idempotencyKey],
        )
        if (ulangan.rows[0]) {
          return { replayed: true, ...(ulangan.rows[0].response_body as ImportResultBody) }
        }

        const sudahAda = await tx.query(
          `select 1 from import_jobs
            where workspace_id = $1 and kind = 'supplier' and content_hash = $2 and cancelled_at is null`,
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
           values ($1, 'import.suppliers', $2, $3)`,
          [context.workspaceId, input.idempotencyKey, file.contentHash],
        )

        const job = await tx.query<{ id: string }>(
          `insert into import_jobs
             (workspace_id, kind, file_name, content_hash, total_rows, created_by)
           values ($1, 'supplier', $2, $3, $4, $5)
           returning id`,
          [context.workspaceId, input.fileName ?? null, file.contentHash, validation.valid.length, context.userId],
        )
        const jobId = Number(job.rows[0]!.id)

        const skipped: Array<{ rowNumber: number; name: string; message: string }> = []
        let imported = 0

        for (const row of validation.valid) {
          const ada = await tx.query<{ id: string }>(
            'select id from suppliers where workspace_id = $1 and lower(name) = $2',
            [context.workspaceId, row.name.toLowerCase()],
          )
          if (ada.rows[0]) {
            skipped.push({
              rowNumber: row.rowNumber,
              name: row.name,
              message: `Supplier ${row.name} sudah ada di workspace ini, jadi dilewati.`,
            })
            continue
          }

          const inserted = await tx.query<{ id: string }>(
            `insert into suppliers
               (workspace_id, name, contact_name, phone, email, address, payment_term_days, note)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             returning id`,
            [
              context.workspaceId,
              row.name,
              row.contactName,
              row.phone,
              row.email,
              row.address,
              row.paymentTermDays,
              row.note,
            ],
          )

          await tx.query(
            'insert into import_job_suppliers (workspace_id, import_job_id, supplier_id) values ($1, $2, $3)',
            [context.workspaceId, jobId, inserted.rows[0]!.id],
          )
          imported += 1
        }

        await tx.query('update import_jobs set imported_rows = $2, skipped_rows = $3 where id = $1', [
          jobId,
          imported,
          skipped.length,
        ])

        const body: ImportResultBody = {
          importJobId: jobId,
          imported,
          skipped: skipped.length,
          skippedRows: skipped.slice(0, 100),
        }

        await tx.query(
          `update idempotency_keys set response_status = 201, response_body = $3, completed_at = now()
            where workspace_id = $1 and operation = 'import.suppliers' and key = $2`,
          [context.workspaceId, input.idempotencyKey, JSON.stringify(body)],
        )

        return { replayed: false, ...body }
      })

      if (!hasil.replayed) {
        await writeAudit(db, {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          actorRole: context.role,
          action: 'import.suppliers',
          objectType: 'import',
          objectId: String(hasil.importJobId),
          metadata: { imported: hasil.imported, skipped: hasil.skipped },
        })
      }

      return reply.code(201).send(hasil)
    },
  )
}
