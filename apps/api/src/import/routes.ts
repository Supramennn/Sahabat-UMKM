import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { AuthorizationError, loadWorkspaceRole } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { StockError } from '../stock/movements.ts'
import { can } from '@sahabat/shared'
import { ensurePlanCapacity } from '../plans/service.ts'
import {
  hashImportContent,
  importPreviewSchema,
  missingHeaders,
  parseCsv,
  validateProductRows,
} from './products-csv.ts'

/**
 * Impor produk (PRD 6.8, skenario 1 PRD 3, A-01).
 *
 * Dua langkah yang sengaja dipisah: pratinjau dan commit. Pratinjau tidak menulis
 * apa pun, jadi pengguna bisa memperbaiki berkas sebelum ada data yang tersimpan.
 * Commit menyimpan semua baris atau tidak ada sama sekali.
 *
 * Batas paket belum dihitung di sini karena tabel langganan belum ada. Yang
 * diperiksa sekarang adalah batas keras per impor, dan SKU yang sudah ada akan
 * dilewati, bukan ditulis ulang. Batas produk aktif per paket diperiksa begitu
 * langganan ada; pesannya akan menyebut angka batas dan cara menaikkan paket
 * seperti A-01 meminta.
 */

const MAX_ROWS_PER_IMPORT = 20_000

interface WorkspaceGate {
  workspaceId: number
  role: 'owner' | 'admin' | 'purchasing' | 'staff' | 'viewer'
}

interface ImportResultBody {
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
  app.post('/api/workspaces/:workspaceId/imports/products/preview', async (request, reply) => {
    await requireGate(db, request, 'data.import')
    const input = importPreviewSchema.parse(request.body)

    const parsed = parseCsv(input.content)
    const missing = missingHeaders(parsed.headers)

    if (missing.length > 0) {
      return reply.code(400).send({
        error: 'kolom_wajib_kurang',
        message: `Kolom wajib belum ada: ${missing.join(', ')}. Unduh template untuk melihat contoh.`,
        missingHeaders: missing,
        detectedHeaders: parsed.headers,
      })
    }

    if (parsed.problems.length > 0) {
      return reply.code(400).send({
        error: 'baris_tidak_bisa_dibaca',
        message: `Ada ${parsed.problems.length} baris yang jumlah kolomnya tidak sama dengan header.`,
        problems: parsed.problems.slice(0, 100),
      })
    }

    const validation = validateProductRows(parsed.rows)

    return reply.code(200).send({
      totalRows: parsed.rows.length,
      validRows: validation.valid.length,
      problemRows: validation.problems.length,
      problems: validation.problems.slice(0, 100),
      // Sampel supaya pengguna bisa membandingkan isi berkasnya dengan yang akan
      // disimpan.
      sample: validation.valid.slice(0, 10),
      maxRowsPerImport: MAX_ROWS_PER_IMPORT,
      exceedsRowLimit: parsed.rows.length > MAX_ROWS_PER_IMPORT,
    })
  })

  /**
   * Commit. Semua baris valid disimpan dalam satu transaksi; kalau satu baris
   * gagal, tidak ada baris yang tersimpan (PRD 6.8).
   */
  app.post('/api/workspaces/:workspaceId/imports/products', async (request, reply) => {
    const context = await requireGate(db, request, 'data.import')
    const input = importPreviewSchema.parse(request.body)

    const parsed = parseCsv(input.content)
    const missing = missingHeaders(parsed.headers)
    if (missing.length > 0) {
      return reply.code(400).send({
        error: 'kolom_wajib_kurang',
        message: `Kolom wajib belum ada: ${missing.join(', ')}.`,
        missingHeaders: missing,
      })
    }

    const validation = validateProductRows(parsed.rows)

    // Pratinjau yang bersih berarti tidak ada yang bisa disimpan. Kembalikan
    // masalahnya, bukan melaporkan impor kosong sebagai berhasil.
    if (validation.problems.length > 0 && validation.valid.length === 0) {
      return reply.code(400).send({
        error: 'tidak_ada_baris_valid',
        message: `Tidak ada baris yang bisa disimpan. ${validation.problems.length} baris bermasalah.`,
        problems: validation.problems.slice(0, 100),
      })
    }

    // Impor berjalan penuh atau tidak sama sekali. Kalau ada satu baris saja yang
    // bermasalah, tidak ada yang disimpan.
    if (validation.problems.length > 0) {
      return reply.code(400).send({
        error: 'impor_berhenti',
        message:
          `Impor tidak dijalankan karena ${validation.problems.length} baris bermasalah. ` +
          'Perbaiki baris itu lalu impor ulang. Tidak ada data yang tersimpan.',
        problems: validation.problems.slice(0, 100),
      })
    }

    if (validation.valid.length > MAX_ROWS_PER_IMPORT) {
      return reply.code(400).send({
        error: 'melebihi_batas_baris',
        message:
          `Satu impor maksimal ${MAX_ROWS_PER_IMPORT} baris, dan berkas ini berisi ` +
          `${validation.valid.length} baris. Pecah berkasnya menjadi beberapa bagian.`,
        maxRowsPerImport: MAX_ROWS_PER_IMPORT,
      })
    }

    const requestHash = hashImportContent(input.content)

    const hasil: ImportResultBody & { replayed: boolean } = await db.transaction(async (tx) => {
      const ulangan = await tx.query<{ response_status: number; response_body: Record<string, unknown> }>(
        `select response_status, response_body from idempotency_keys
          where workspace_id = $1 and operation = $2 and key = $3`,
        [context.workspaceId, 'import.products', input.idempotencyKey],
      )
      const sebelumnya = ulangan.rows[0]
      if (sebelumnya) {
        return {
          replayed: true,
          ...(sebelumnya.response_body as unknown as ImportResultBody),
        }
      }

      await tx.query(
        `insert into idempotency_keys (workspace_id, operation, key, request_hash)
         values ($1, 'import.products', $2, $3)`,
        [context.workspaceId, input.idempotencyKey, requestHash],
      )

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

        created.push(productId)
      }

      const body: ImportResultBody = {
        imported: created.length,
        skipped: skipped.length,
        categoriesCreated: kategoriNames.length,
        skippedRows: skipped.slice(0, 100),
      }

      await tx.query(
        `update idempotency_keys set response_status = 201, response_body = $4, completed_at = now()
          where workspace_id = $1 and operation = $2 and key = $3`,
        [context.workspaceId, 'import.products', input.idempotencyKey, JSON.stringify(body)],
      )

      return { replayed: false, ...body }
    })

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: request.sessionUser?.userId ?? null,
        actorRole: context.role,
        action: 'import.products',
        objectType: 'import',
        metadata: {
          imported: hasil.imported,
          skipped: hasil.skipped,
        },
      })
    }

    return reply.code(201).send(hasil)
  })
}

async function requireGate(
  db: Database,
  request: FastifyRequest,
  capability: 'data.import',
): Promise<WorkspaceGate> {
  const params = (request.params ?? {}) as Record<string, string>
  const workspaceId = Number(params.workspaceId)
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new StockError('data_tidak_valid', 'Alamat tidak valid.', 400)
  }

  const { workspaceId: id, role } = await loadWorkspaceRole(db, request, workspaceId)
  if (!can(role, capability)) {
    throw new AuthorizationError('Impor hanya bisa dilakukan Owner dan Admin.')
  }
  return { workspaceId: id, role }
}
