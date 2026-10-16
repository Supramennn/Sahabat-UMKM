import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { Database } from '@sahabat/db'
import { looksLikeStockPurchase, stockPurchaseWarning } from '@sahabat/shared'
import { writeAudit } from '../auth/audit.ts'
import { queryFlag } from '../common/http.ts'
import { asNumber, StockError } from '../stock/movements.ts'
import { idFrom, paramsOf, requireCapability } from '../purchasing/routes.ts'
import { todayInWorkspace, toDateString } from '../purchasing/documents.ts'
import {
  ACCEPTED_PDF,
  acceptedImageType,
  attachmentKey,
  LocalObjectStorage,
  localStorageDirectory,
  MAX_ATTACHMENT_BYTES,
  UnconfiguredStorage,
  type ObjectStorage,
} from '../storage/index.ts'
import {
  attachmentUploadSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseCategorySchema,
} from './schemas.ts'

/**
 * Pengeluaran operasional (PRD 6.5).
 *
 * Tiga aturan yang dijaga di sini:
 *
 * 1. Kategori hanya bisa diubah Owner dan Admin. Pengeluaran dicatat oleh peran yang
 * memiliki izin expenses.manage,
 *    tapi tidak boleh mengubah daftar kategori karena daftar itu memengaruhi laporan
 *    periode yang sedang ditutup.
 * 2. Pembelian barang lewat PO tidak boleh dicatat dua kali. Kalau pengeluaran
 *    menautkan PO, satu PO hanya boleh dipakai satu kali, danCategorie yang
 *    terdengar seperti pembelian stok memunculkan peringatan sebelum disimpan.
 * 3. Pengeluaran yang sudah tersimpan tidak dapat dihapus. Koreksi dibuat sebagai
 *    pengeluaran baru.
 */

const MAX_ATTACHMENTS_PER_EXPENSE = 5

export function registerExpenseRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  const storage: ObjectStorage =
    process.env.OBJECT_STORAGE_DIR === undefined
      ? new UnconfiguredStorage()
      : new LocalObjectStorage(localStorageDirectory())

  registerCategoryRoutes(app, db)
  registerExpenseRoutesInternal(app, db)
  registerAttachmentRoutes(app, db, storage)
}

function registerCategoryRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/expense-categories', async (request) => {
    const context = await requireCapability(db, request, 'reports.expenses')
    const includeArchived = queryFlag(request, 'archived')

    const categories = await db.query<{ id: string; name: string; is_archived: boolean; total: string; count: string }>(
      `select c.id, c.name, c.is_archived,
              coalesce(sum(e.amount), 0) as total,
              count(e.id) as count
         from expense_categories c
         left join expenses e on e.category_id = c.id and e.workspace_id = c.workspace_id
        where c.workspace_id = $1 and ($2 or not c.is_archived)
        group by c.id
        order by lower(c.name)`,
      [context.workspaceId, includeArchived],
    )

    return {
      categories: categories.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        archived: row.is_archived,
        expenseCount: Number(row.count),
        totalAmount: asNumber(row.total),
        looksLikeStockPurchase: looksLikeStockPurchase(row.name),
      })),
    }
  })

  // PRD 6.5: kategori diatur Owner dan Admin.
  app.post('/api/workspaces/:workspaceId/expense-categories', async (request, reply) => {
    const context = await requireCategoryAdmin(db, request)
    const input = createExpenseCategorySchema.parse(request.body)

    const created = await db.query<{ id: string }>(
      'insert into expense_categories (workspace_id, name) values ($1, $2) returning id',
      [context.workspaceId, input.name],
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'expense_category.create',
      objectType: 'expense_category',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({
      categoryId: Number(created.rows[0]!.id),
      warnings: looksLikeStockPurchase(input.name) ? [stockPurchaseWarning(input.name)] : [],
    })
  })

  app.patch('/api/workspaces/:workspaceId/expense-categories/:categoryId', async (request) => {
    const context = await requireCategoryAdmin(db, request)
    const categoryId = idFrom(paramsOf(request).categoryId)
    const input = updateExpenseCategorySchema.parse(request.body)

    const updated = await db.query<{ name: string }>(
      `update expense_categories
          set name = coalesce($3, name),
              is_archived = coalesce($4, is_archived)
        where id = $1 and workspace_id = $2
        returning name`,
      [categoryId, context.workspaceId, input.name ?? null, input.isArchived ?? null],
    )

    const row = updated.rows[0]
    if (!row) {
      throw new StockError('kategori_tidak_ditemukan', 'Kategori pengeluaran tidak ditemukan.', 404)
    }

    return {
      archived: input.isArchived ?? false,
      warnings: looksLikeStockPurchase(row.name) ? [stockPurchaseWarning(row.name)] : [],
    }
  })
}

function registerExpenseRoutesInternal(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/expenses', async (request) => {
    const context = await requireCapability(db, request, 'reports.expenses')
    const query = listExpensesQuerySchema.parse(request.query ?? {})

    const filters = ['e.workspace_id = $1']
    const values: unknown[] = [context.workspaceId]

    if (query.from) {
      values.push(query.from)
      filters.push(`e.spent_on >= $${values.length}`)
    }
    if (query.to) {
      values.push(query.to)
      filters.push(`e.spent_on <= $${values.length}`)
    }
    if (query.categoryId) {
      values.push(query.categoryId)
      filters.push(`e.category_id = $${values.length}`)
    }

    const where = filters.join(' and ')

    const total = await db.query<{ total: string; amount: string }>(
      `select count(*) as total, coalesce(sum(e.amount), 0) as amount from expenses e where ${where}`,
      values,
    )

    const rows = await db.query<{
      id: string
      spent_on: string
      category_name: string | null
      description: string
      amount: string
      reference: string | null
      order_number: string | null
      created_by_name: string
      attachment_count: string
    }>(
      `select e.id, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, c.name as category_name, e.description, e.amount, e.reference,
              o.number as order_number,
              coalesce(u.name, 'Akun dihapus') as created_by_name,
              (select count(*) from expense_attachments a
                where a.expense_id = e.id and a.workspace_id = e.workspace_id) as attachment_count
         from expenses e
         left join expense_categories c on c.id = e.category_id and c.workspace_id = e.workspace_id
         left join purchase_orders o on o.id = e.purchase_order_id and o.workspace_id = e.workspace_id
         left join users u on u.id = e.created_by
        where ${where}
        order by e.spent_on desc, e.id desc
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.limit, query.offset],
    )

    return {
      expenses: rows.rows.map((row) => ({
        id: Number(row.id),
        spentOn: row.spent_on,
        categoryName: row.category_name ?? 'Tanpa kategori',
        description: row.description,
        amount: asNumber(row.amount),
        reference: row.reference,
        purchaseOrderNumber: row.order_number,
        createdByName: row.created_by_name,
        attachmentCount: Number(row.attachment_count),
      })),
      summary: {
        totalAmount: asNumber(total.rows[0]?.amount),
      },
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(total.rows[0]?.total ?? 0),
      },
    }
  })

  app.post('/api/workspaces/:workspaceId/expenses', async (request, reply) => {
    const context = await requireCapability(db, request, 'expenses.manage')
    const input = createExpenseSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      const hariIni = input.spentOn ?? toDateString(await todayInWorkspace(tx, context.workspaceId))

      let categoryId: number | null = null
      let categoryName: string | null = null

      if (input.categoryId) {
        const kategori = await tx.query<{ id: string; name: string; is_archived: boolean }>(
          'select id, name, is_archived from expense_categories where id = $1 and workspace_id = $2',
          [input.categoryId, context.workspaceId],
        )
        const row = kategori.rows[0]
        if (!row || row.is_archived) {
          throw new StockError('kategori_tidak_ditemukan', 'Kategori pengeluaran tidak ditemukan.', 404)
        }
        categoryId = Number(row.id)
        categoryName = row.name
      } else if (input.categoryName) {
        // Kategori yang diketik langsung dipakai kalau belum ada. Ini supaya pengeluaran
        // pertama bisa dicatat tanpa harus diminta mengatur kategori lebih dulu, yang
        // menambah satu langkah tanpa menambah ketepatan.
        const lower = input.categoryName.toLowerCase()
        const ada = await tx.query<{ id: string; name: string }>(
          'select id, name from expense_categories where workspace_id = $1 and lower(name) = $2 and not is_archived',
          [context.workspaceId, lower],
        )
        if (ada.rows[0]) {
          categoryId = Number(ada.rows[0].id)
          categoryName = ada.rows[0].name
        } else {
          const dibuat = await tx.query<{ id: string }>(
            'insert into expense_categories (workspace_id, name) values ($1, $2) returning id',
            [context.workspaceId, input.categoryName],
          )
          categoryId = Number(dibuat.rows[0]!.id)
          categoryName = input.categoryName
        }
      }

      if (input.purchaseOrderId) {
        const sudah = await tx.query(
          'select 1 from expenses where workspace_id = $1 and purchase_order_id = $2',
          [context.workspaceId, input.purchaseOrderId],
        )
        if (sudah.rows.length > 0) {
          throw new StockError(
            'po_sudah_terhubung',
            'PO ini sudah ditautkan ke pengeluaran lain. Satu pembelian tidak boleh dihitung dua kali.',
            409,
          )
        }

        const order = await tx.query('select 1 from purchase_orders where id = $1 and workspace_id = $2', [
          input.purchaseOrderId,
          context.workspaceId,
        ])
        if (order.rows.length === 0) {
          throw new StockError('po_tidak_ditemukan', 'Purchase order tidak ditemukan.', 404)
        }
      }

      const inserted = await tx.query<{ id: string }>(
        `insert into expenses
           (workspace_id, spent_on, category_id, description, amount, reference, purchase_order_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          context.workspaceId,
          hariIni,
          categoryId,
          input.description,
          input.amount,
          input.reference ?? null,
          input.purchaseOrderId ?? null,
          context.userId,
        ],
      )

      return {
        expenseId: Number(inserted.rows[0]!.id),
        categoryName,
        spentOn: hariIni,
      }
    })

    const warnings: string[] = []
    if (hasil.categoryName && looksLikeStockPurchase(hasil.categoryName)) {
      warnings.push(stockPurchaseWarning(hasil.categoryName))
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'expense.create',
      objectType: 'expense',
      objectId: String(hasil.expenseId),
      metadata: { amount: input.amount, category: hasil.categoryName },
    })

    return reply.code(201).send({
      expenseId: hasil.expenseId,
      spentOn: hasil.spentOn,
      warnings,
    })
  })

  app.get('/api/workspaces/:workspaceId/expenses/:expenseId', async (request) => {
    const context = await requireCapability(db, request, 'reports.expenses')
    const expenseId = idFrom(paramsOf(request).expenseId)

    const expense = await db.query<{
      id: string
      spent_on: string
      category_name: string | null
      description: string
      amount: string
      reference: string | null
      purchase_order_id: string | null
      order_number: string | null
      created_by_name: string
      created_at: Date
    }>(
      `select e.id, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, c.name as category_name, e.description, e.amount, e.reference,
              e.purchase_order_id, o.number as order_number,
              coalesce(u.name, 'Akun dihapus') as created_by_name, e.created_at
         from expenses e
         left join expense_categories c on c.id = e.category_id and c.workspace_id = e.workspace_id
         left join purchase_orders o on o.id = e.purchase_order_id and o.workspace_id = e.workspace_id
         left join users u on u.id = e.created_by
        where e.id = $1 and e.workspace_id = $2`,
      [expenseId, context.workspaceId],
    )

    const row = expense.rows[0]
    if (!row) {
      throw new StockError('pengeluaran_tidak_ditemukan', 'Pengeluaran tidak ditemukan.', 404)
    }

    const attachments = await db.query<{
      id: string
      kind: string
      object_key: string
      file_name: string
      content_type: string
      size_bytes: string
    }>(
      `select id, kind, object_key, file_name, content_type, size_bytes
         from expense_attachments
        where expense_id = $1 and workspace_id = $2
        order by id`,
      [expenseId, context.workspaceId],
    )

    return {
      expense: {
        id: Number(row.id),
        spentOn: row.spent_on,
        categoryName: row.category_name ?? 'Tanpa kategori',
        description: row.description,
        amount: asNumber(row.amount),
        reference: row.reference,
        purchaseOrderId: row.purchase_order_id ? Number(row.purchase_order_id) : null,
        purchaseOrderNumber: row.order_number,
        createdByName: row.created_by_name,
        createdAt: row.created_at.toISOString(),
      },
      attachments: attachments.rows.map((item) => ({
        id: Number(item.id),
        kind: item.kind,
        fileName: item.file_name,
        contentType: item.content_type,
        sizeBytes: Number(item.size_bytes),
        url: `/api/workspaces/${context.workspaceId}/media/${encodeURIComponent(item.object_key)}`,
      })),
    }
  })
}

function registerAttachmentRoutes(
  app: FastifyInstance,
  db: Database,
  storage: ObjectStorage,
): void {
  app.post('/api/workspaces/:workspaceId/expenses/:expenseId/attachments', {
    bodyLimit: Math.ceil(MAX_ATTACHMENT_BYTES * 1.4) + 32_768,
  }, async (request, reply) => {
    const context = await requireCapability(db, request, 'expenses.manage')
    const expenseId = idFrom(paramsOf(request).expenseId)
    const input = attachmentUploadSchema.parse(request.body)

    const declared =
      input.contentType.toLowerCase() === 'application/pdf'
        ? ACCEPTED_PDF
        : acceptedImageType(input.contentType)

    if (!declared) {
      return reply.code(400).send({
        error: 'jenis_berkas_tidak_didukung',
        message: 'Lampiran harus berupa foto JPEG, PNG, WebP, atau PDF.',
      })
    }

    const data = decodeDataUrl(input.data)

    if (data.byteLength > MAX_ATTACHMENT_BYTES) {
      return reply.code(413).send({
        error: 'berkas_terlalu_besar',
        message: `Ukuran lampiran maksimal ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      })
    }

    const sniffed = sniffAttachment(data)
    if (sniffed !== declared.contentType) {
      return reply.code(400).send({
        error: 'isi_berkas_tidak_cocok',
        message: 'Isi berkas tidak cocok dengan jenis berkasnya.',
      })
    }

    const key = attachmentKey(context.workspaceId, expenseId, randomUUID(), declared.extension)
    let stored = false
    let attachmentId: number

    try {
      attachmentId = await db.transaction(async (tx) => {
        const expense = await tx.query(
          'select 1 from expenses where id = $1 and workspace_id = $2 for update',
          [expenseId, context.workspaceId],
        )
        if (expense.rows.length === 0) {
          throw new StockError('pengeluaran_tidak_ditemukan', 'Pengeluaran tidak ditemukan.', 404)
        }

        const existing = await tx.query<{ total: string }>(
          'select count(*) as total from expense_attachments where expense_id = $1 and workspace_id = $2',
          [expenseId, context.workspaceId],
        )
        if (Number(existing.rows[0]?.total ?? 0) >= MAX_ATTACHMENTS_PER_EXPENSE) {
          throw new StockError(
            'lampiran_terlalu_banyak',
            `Satu pengeluaran maksimal ${MAX_ATTACHMENTS_PER_EXPENSE} lampiran.`,
            400,
          )
        }

        await storage.put(key, data, declared.contentType)
        stored = true

        const inserted = await tx.query<{ id: string }>(
          `insert into expense_attachments
             (workspace_id, expense_id, kind, object_key, file_name, content_type, size_bytes, uploaded_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           returning id`,
          [
            context.workspaceId,
            expenseId,
            declared.extension === 'pdf' ? 'pdf' : 'foto',
            key,
            input.fileName,
            declared.contentType,
            data.byteLength,
            context.userId,
          ],
        )
        return Number(inserted.rows[0]!.id)
      })
    } catch (error) {
      if (stored) await storage.remove(key)
      throw error
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'expense.attachment_added',
      objectType: 'expense',
      objectId: String(expenseId),
      metadata: { attachmentId, kind: declared.extension === 'pdf' ? 'pdf' : 'foto' },
    })

    return reply.code(201).send({
      attachmentId,
      fileName: input.fileName,
      url: `/api/workspaces/${context.workspaceId}/media/${encodeURIComponent(key)}`,
    })
  })
}

interface CategoryAdminContext {
  workspaceId: number
  role: 'owner' | 'admin'
  userId: number
}

/**
 * Kategori pengeluaran hanya untuk Owner dan Admin (PRD 6.5). Buyer dan staf tidak
 * boleh mengubah daftar ini, karena daftar kategori menentukan pengelompokan laporan
 * pada periode yang sudah lewat.
 */
async function requireCategoryAdmin(
  db: Database,
  request: FastifyRequest,
): Promise<CategoryAdminContext> {
  const context = await requireCapability(db, request, 'expenses.manage')

  if (context.role !== 'owner' && context.role !== 'admin') {
    throw new StockError(
      'tidak_diizinkan',
      'Hanya Owner dan Admin yang bisa mengatur kategori pengeluaran.',
      403,
    )
  }

  return { workspaceId: context.workspaceId, role: context.role, userId: context.userId }
}

/**
 * Magic bytes foto dan PDF. Header Content-Type berasal dari peramban dan bisa apa
 * saja, jadi jenis berkas ditentukan dari isinya (PRD 9).
 */
function sniffAttachment(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf'
  }
  return null
}

function decodeDataUrl(input: string): Buffer {
  const [, payload = ''] = input.split(',', 2)
  return Buffer.from(payload, 'base64')
}
