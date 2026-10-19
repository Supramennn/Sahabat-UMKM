import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import type { Database, Transaction } from '@sahabat/db'
import { can, grantFor, roundRupiah, type Role } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole, requireSession } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { assertFeature, effectivePlan, ensureFeature, lockWorkspace } from '../plans/service.ts'
import { StockError, recordMovement, asNumber } from '../stock/movements.ts'
import { notifyPurchaseOrderDecision, notifyPurchaseOrderSubmitted } from '../notifications/hooks.ts'
import { allocateDocumentNumber, toDateString, todayInWorkspace } from './documents.ts'
import {
  closeOrderSchema,
  createOrderSchema,
  createPaymentSchema,
  createReceiptSchema,
  createReturnSchema,
  createSupplierSchema,
  decideOrderSchema,
  listOrdersQuerySchema,
  submitOrderSchema,
  updateOrderSchema,
  updateSupplierSchema,
} from './schemas.ts'

/**
 * Modul pembelian (PRD 6.3).
 *
 * Tiga hal yang paling mudah rusak di sini dan karena itu dijaga ketat:
 *
 * 1. PO yang sudah disetujui tidak boleh diubah diam-diam. Perubahan harus lewat
 *    revisi bernomor dengan alasan, dan jejak revisinya tidak bisa diubah.
 * 2. Penerimaan hanya menambah sebesar jumlah yang benar-benar diterima, tidak
 *    sebesar jumlah di PO. Kalau tidak, barang yang belum datang akan ikut menambah
 *    stok.
 * 3. Permintaan penerimaan memakai kunci idempotency, jadi permintaan yang terkirim
 *    dua kali tidak menambah stok dua kali (PRD 9).
 */

export interface WorkspaceContext {
  workspaceId: number
  role: Role
  userId: number
}

export function registerPurchasingRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  registerSupplierRoutes(app, db)
  registerOrderRoutes(app, db)
  registerReceiptRoutes(app, db)
  registerReturnRoutes(app, db)
  registerPaymentRoutes(app, db)
}

/* Supplier ------------------------------------------------------------------ */

function registerSupplierRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/suppliers', async (request, reply) => {
    const context = await requireCapability(db, request, 'suppliers.manage')
    const suppliers = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      const plan = await effectivePlan(tx, context.workspaceId)
      const suppliers = await tx.query<SupplierRow>(
        `select s.id, s.name, s.contact_name, s.phone, s.email, s.address,
                s.payment_term_days, s.note, s.is_archived,
                case when $2 then
                  coalesce((select sum(e.amount) from supplier_debt_entries e
                             where e.supplier_id = s.id and e.workspace_id = s.workspace_id), 0)
                    - coalesce((select sum(p.amount) from supplier_payments p
                                 where p.supplier_id = s.id and p.workspace_id = s.workspace_id), 0)
                else null::bigint end as debt
           from suppliers s
          where s.workspace_id = $1
          order by s.is_archived asc, s.name asc`,
        [context.workspaceId, plan !== 'gratis'],
      )
      return suppliers
    })

    return reply.code(200).send({
      suppliers: suppliers.rows.map(supplierRow),
    })
  })

  app.post('/api/workspaces/:workspaceId/suppliers', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'suppliers.manage')
    const input = createSupplierSchema.parse(request.body)

    const created = await db.query<{ id: string }>(
      `insert into suppliers
         (workspace_id, name, contact_name, phone, email, address, payment_term_days, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        context.workspaceId,
        input.name,
        input.contactName ?? null,
        input.phone ?? null,
        input.email || null,
        input.address ?? null,
        input.paymentTermDays ?? null,
        input.note ?? null,
      ],
    ).catch((error: unknown) => {
      if ((error as { code?: string } | null)?.code === '23505') {
        throw new StockError(
          'supplier_sudah_ada',
          `Supplier ${input.name} sudah ada di workspace ini.`,
        )
      }
      throw error
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'supplier.created',
      objectType: 'supplier',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ supplierId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/suppliers/:supplierId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'suppliers.manage')
    const supplierId = idFrom(paramsOf(request).supplierId)
    const input = updateSupplierSchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, supplierId]

    for (const [column, value] of Object.entries({
      name: input.name,
      contact_name: input.contactName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      payment_term_days: input.paymentTermDays,
      note: input.note,
      is_archived: input.isArchived,
    })) {
      if (value === undefined) continue
      params.push(value === '' ? null : value)
      sets.push(`${column} = $${params.length}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'data_tidak_valid', message: 'Tidak ada yang diubah.' })
    }

    const updated = await db.query(
      `update suppliers set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
      params,
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Supplier tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'supplier.updated',
      objectType: 'supplier',
      objectId: String(supplierId),
    })

    return reply.code(200).send({ message: 'Supplier sudah diperbarui.' })
  })
}

/* Purchase order ------------------------------------------------------------- */

function registerOrderRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/purchase-orders', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const query = listOrdersQuerySchema.parse(request.query ?? {})

    const filters = ['o.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (query.status) {
      params.push(query.status)
      filters.push(`o.status = $${params.length}`)
    }
    if (query.supplierId) {
      params.push(query.supplierId)
      filters.push(`o.supplier_id = $${params.length}`)
    }

    const total = await db.query<{ total: number }>(
      `select count(*)::int as total from purchase_orders o where ${filters.join(' and ')}`,
      params,
    )

    params.push(query.limit, query.offset)

    const orders = await db.query<OrderRow>(
      `select o.id, o.number, o.status, o.ordered_on, o.expected_on, o.total_amount,
              o.received_total, o.note, o.created_at, o.approved_at,
              coalesce((select sum(i.quantity) from purchase_order_items i
                         where i.purchase_order_id = o.id and i.workspace_id = o.workspace_id), 0)
                as ordered_total,
              o.supplier_id, s.name as supplier_name,
              o.location_id, l.name as location_name,
              cu.name as created_by_name
         from purchase_orders o
         join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
         join locations l on l.id = o.location_id and l.workspace_id = o.workspace_id
         join users cu on cu.id = o.created_by
        where ${filters.join(' and ')}
        order by o.ordered_on desc, o.id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      orders: orders.rows.map(orderRow),
      pagination: { limit: query.limit, offset: query.offset, total: total.rows[0]?.total ?? 0 },
    })
  })

  app.post('/api/workspaces/:workspaceId/purchase-orders', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const input = createOrderSchema.parse(request.body)

    const dibuat = await db.transaction(async (tx) => {
      const supplier = await tx.query(
        'select id from suppliers where id = $1 and workspace_id = $2 and not is_archived',
        [input.supplierId, context.workspaceId],
      )
      if (supplier.rows.length === 0) {
        throw new StockError('supplier_tidak_ditemukan', 'Supplier tidak ditemukan.', 404)
      }

      const location = await tx.query(
        'select id from locations where id = $1 and workspace_id = $2 and not is_archived',
        [input.locationId, context.workspaceId],
      )
      if (location.rows.length === 0) {
        throw new StockError('lokasi_tidak_ditemukan', 'Lokasi tidak ditemukan.', 404)
      }

      const orderedOn = input.orderedOn
        ? new Date(`${input.orderedOn}T00:00:00.000Z`)
        : await todayInWorkspace(tx, context.workspaceId)

      const number = await allocateDocumentNumber(tx, context.workspaceId, 'po', orderedOn)

      const order = await tx.query<{ id: string }>(
        `insert into purchase_orders
           (workspace_id, supplier_id, location_id, number, ordered_on, expected_on, note, created_by, total_amount)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [
          context.workspaceId,
          input.supplierId,
          input.locationId,
          number,
          toDateString(orderedOn),
          input.expectedOn ?? null,
          input.note ?? null,
          session.userId,
          totalOf(input.items),
        ],
      )
      const orderId = order.rows[0]!.id

      await replaceItems(tx, context.workspaceId, orderId, input.items)

      return { orderId, number }
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.created',
      objectType: 'purchase_order',
      objectId: dibuat.orderId,
    })

    return reply.code(201).send({ orderId: Number(dibuat.orderId), number: dibuat.number })
  })

  app.get('/api/workspaces/:workspaceId/purchase-orders/:orderId', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)

    const order = await db.query<OrderRow>(
      `select o.id, o.number, o.status, o.ordered_on, o.expected_on, o.total_amount,
              o.received_total, o.note, o.created_at, o.approved_at,
              coalesce((select sum(i.quantity) from purchase_order_items i
                         where i.purchase_order_id = o.id and i.workspace_id = o.workspace_id), 0)
                as ordered_total,
              o.supplier_id, s.name as supplier_name,
              o.location_id, l.name as location_name,
              cu.name as created_by_name
         from purchase_orders o
         join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
         join locations l on l.id = o.location_id and l.workspace_id = o.workspace_id
         join users cu on cu.id = o.created_by
        where o.workspace_id = $1 and o.id = $2`,
      [context.workspaceId, orderId],
    )
    const row = order.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'PO tidak ditemukan.' })
    }

    const items = await db.query<OrderItemRow>(
      `select i.id, i.product_id, p.name as product_name, p.sku, p.unit_code,
              i.quantity, i.unit_price, i.discount_amount, i.line_total, i.received_quantity, i.note
         from purchase_order_items i
         join products p on p.id = i.product_id and p.workspace_id = i.workspace_id
        where i.workspace_id = $1 and i.purchase_order_id = $2
        order by p.name asc`,
      [context.workspaceId, orderId],
    )

    const receipts = await db.query<{ id: string; number: string; received_on: string; received_by_name: string }>(
      `select gr.id, gr.number, gr.received_on, u.name as received_by_name
         from goods_receipts gr
         join users u on u.id = gr.received_by
        where gr.workspace_id = $1 and gr.purchase_order_id = $2
        order by gr.received_on desc, gr.id desc`,
      [context.workspaceId, orderId],
    )

    const revisions = await db.query<{ revision_number: number; reason: string; created_at: Date; changed_by_name: string }>(
      `select r.revision_number, r.reason, r.created_at, u.name as changed_by_name
         from purchase_order_revisions r
         join users u on u.id = r.changed_by
        where r.workspace_id = $1 and r.purchase_order_id = $2
        order by r.revision_number desc`,
      [context.workspaceId, orderId],
    )

    return reply.code(200).send({
      order: orderRow(row),
      items: items.rows.map((item) => ({
        id: Number(item.id),
        productId: item.product_id,
        productName: item.product_name,
        sku: item.sku,
        unitCode: item.unit_code,
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unit_price),
        discountAmount: asNumber(item.discount_amount),
        lineTotal: asNumber(item.line_total),
        receivedQuantity: asNumber(item.received_quantity),
        outstanding: asNumber(item.quantity) - asNumber(item.received_quantity),
        note: item.note,
      })),
      receipts: receipts.rows.map((receipt) => ({
        receiptId: Number(receipt.id),
        number: receipt.number,
        receivedOn: receipt.received_on,
        receivedByName: receipt.received_by_name,
      })),
      revisions: revisions.rows.map((revision) => ({
        revisionNumber: revision.revision_number,
        reason: revision.reason,
        createdAt: revision.created_at,
        changedByName: revision.changed_by_name,
      })),
    })
  })

  app.patch('/api/workspaces/:workspaceId/purchase-orders/:orderId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = updateOrderSchema.parse(request.body)

    await db.transaction(async (tx) => {
      const order = await tx.query<{
        id: string
        status: string
        created_by: string
        total_amount: number
        location_id: number
        expected_on: string | null
        note: string | null
      }>(
        `select id, status, created_by, total_amount, location_id, expected_on, note
           from purchase_orders
          where id = $1 and workspace_id = $2
          for update`,
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }

      if (row.status !== 'draft' && row.status !== 'diajukan') {
        throw new StockError(
          'po_tidak_bisa_diubah',
          `PO berstatus ${orderStatusLabels[row.status] ?? row.status} tidak bisa diubah. Buat PO baru atau revisi yang tercatat.`,
        )
      }

      // PRD 6.3: PO yang sudah pernah diajukan tidak boleh diubah tanpa alasan
      // yang tercatat, supaya jejaknya bisa ditelusuri.
      const perluCatatan = row.status === 'diajukan' && input.items !== undefined
      if (perluCatatan && !input.revisionReason) {
        throw new StockError(
          'catatan_revisi_wajib',
          'PO yang sudah diajukan harus punya catatan alasan kalau barangnya diubah.',
        )
      }

      if (input.items) {
        const total = totalOf(input.items)
        await replaceItems(tx, context.workspaceId, orderId, input.items)
        await tx.query('update purchase_orders set total_amount = $1 where id = $2', [
          total,
          orderId,
        ])

        if (row.status === 'diajukan') {
          await catatRevisi(tx, context.workspaceId, orderId, input.revisionReason!, session.userId, [
            { total, note: input.note ?? row.note },
          ])
        }
        return
      }

      const sets: string[] = []
      const params: unknown[] = [orderId, context.workspaceId]
      for (const [column, value] of Object.entries({
        location_id: input.locationId,
        expected_on: input.expectedOn,
        note: input.note,
      })) {
        if (value === undefined) continue
        params.push(value)
        sets.push(`${column} = $${params.length}`)
      }
      if (sets.length > 0) {
        await tx.query(
          `update purchase_orders set ${sets.join(', ')} where id = $1 and workspace_id = $2`,
          params,
        )
      }
    })

    return reply.code(200).send({ message: 'PO sudah diperbarui.' })
  })

  /** PRD 6.3: PO dibuat sebagai draft lalu diajukan untuk persetujuan. */
  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/submit', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = submitOrderSchema.parse(request.body ?? {})

    await db.transaction(async (tx) => {
      const order = await tx.query<{ status: string }>(
        'select status from purchase_orders where id = $1 and workspace_id = $2 for update',
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (row.status !== 'draft') {
        throw new StockError(
          'sudah_diajukan',
          `PO ini sudah berstatus ${orderStatusLabels[row.status] ?? row.status}.`,
        )
      }

      await tx.query(
        `update purchase_orders set status = 'diajukan', submitted_at = now(), note = coalesce($3, note)
          where id = $1 and workspace_id = $2`,
        [orderId, context.workspaceId, input.note ?? null],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.submitted',
      objectType: 'purchase_order',
      objectId: String(orderId),
    })

    await notifyPurchaseOrderSubmitted(db, {
      workspaceId: context.workspaceId,
      orderId,
      actorUserId: session.userId,
    })

    return reply.code(200).send({ message: 'PO diajukan untuk persetujuan.' })
  })

  /**
   * Persetujuan. PRD 6.3 dan 8: pembuat PO tidak bisa menyetujui PO sendiri
   * ketika aturan approval menyala, dan hanya peran yang memang berwenang yang
   * bisa menyetujui.
   */
  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/approve', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.approve')
    const orderId = idFrom(paramsOf(request).orderId)

    await db.transaction(async (tx) => {
      const order = await tx.query<{
        status: string
        created_by: string
        total_amount: number
        approval_required: boolean
        approval_threshold: string | null
      }>(
        `select o.status, o.created_by, o.total_amount,
                s.approval_required, s.approval_threshold_amount
           from purchase_orders o
           join workspace_settings s on s.workspace_id = o.workspace_id
          where o.id = $1 and o.workspace_id = $2
          for update of o`,
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (row.status !== 'diajukan') {
        throw new StockError(
          'tidak_bisa_disetujui',
          `PO ini sudah berstatus ${orderStatusLabels[row.status] ?? row.status}.`,
        )
      }

      // B-03: persetujuan berjenjang hanya untuk paket Bisnis, jadi ambang nominal
      // belum dipakai di sini. Yang dipakai adalah aturan persetujuan per workspace.
      if (row.approval_required && Number(row.created_by) === session.userId) {
        throw new StockError(
          'tidak_bisa_menyetujui_sendiri',
          'PO yang Anda buat sendiri tidak bisa Anda setujui. Minta anggota lain yang menyetujui.',
        )
      }

      await tx.query(
        `update purchase_orders set status = 'disetujui', approved_by = $1, approved_at = now()
          where id = $2 and workspace_id = $3`,
        [session.userId, orderId, context.workspaceId],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.approved',
      objectType: 'purchase_order',
      objectId: String(orderId),
    })

    await notifyPurchaseOrderDecision(db, {
      workspaceId: context.workspaceId,
      orderId,
      decision: 'disetujui',
      actorUserId: session.userId,
    })

    return reply.code(200).send({ message: 'PO disetujui.' })
  })

  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/reject', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.approve')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = decideOrderSchema.parse(request.body ?? {})

    await db.transaction(async (tx) => {
      const order = await tx.query<{ status: string; created_by: string; approval_required: boolean }>(
        `select o.status, o.created_by, s.approval_required
           from purchase_orders o
           join workspace_settings s on s.workspace_id = o.workspace_id
          where o.id = $1 and o.workspace_id = $2
          for update of o`,
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (row.status !== 'diajukan') {
        throw new StockError(
          'tidak_bisa_ditolak',
          `PO ini sudah berstatus ${orderStatusLabels[row.status] ?? row.status}.`,
        )
      }
      if (row.approval_required && Number(row.created_by) === session.userId) {
        throw new StockError(
          'tidak_bisa_menolak_sendiri',
          'PO yang Anda buat sendiri tidak bisa Anda tolak. Minta anggota lain yang memutuskan.',
        )
      }

      await tx.query(
        `update purchase_orders set status = 'ditolak', rejected_reason = $1, approved_at = now()
          where id = $2 and workspace_id = $3`,
        [input.reason ?? null, orderId, context.workspaceId],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.rejected',
      objectType: 'purchase_order',
      objectId: String(orderId),
      metadata: { reason: input.reason ?? null },
    })

    await notifyPurchaseOrderDecision(db, {
      workspaceId: context.workspaceId,
      orderId,
      decision: 'ditolak',
      actorUserId: session.userId,
      reason: input.reason ?? null,
    })

    return reply.code(200).send({ message: 'PO ditolak.' })
  })

  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/cancel', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = decideOrderSchema.parse(request.body ?? {})

    await db.transaction(async (tx) => {
      const order = await tx.query<{ status: string }>(
        'select status from purchase_orders where id = $1 and workspace_id = $2 for update',
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (!['draft', 'diajukan', 'disetujui'].includes(row.status)) {
        throw new StockError(
          'tidak_bisa_dibatalkan',
          'PO yang sudah diterima tidak bisa dibatalkan. Catat retur pembelian sebagai gantinya.',
        )
      }

      await tx.query(
        `update purchase_orders set status = 'dibatalkan', cancelled_reason = $1
          where id = $2 and workspace_id = $3`,
        [input.reason ?? null, orderId, context.workspaceId],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.cancelled',
      objectType: 'purchase_order',
      objectId: String(orderId),
    })

    return reply.code(200).send({ message: 'PO dibatalkan.' })
  })

  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/close', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'purchase_orders.approve')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = closeOrderSchema.parse(request.body ?? {})

    await db.transaction(async (tx) => {
      const order = await tx.query<{ status: string }>(
        'select status from purchase_orders where id = $1 and workspace_id = $2 for update',
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (!['diterima', 'diterima_sebagian'].includes(row.status)) {
        throw new StockError(
          'tidak_bisa_ditutup',
          'Hanya PO yang sudah menerima barang yang bisa ditutup.',
        )
      }

      await tx.query(
        `update purchase_orders set status = 'ditutup', closed_at = now(), note = coalesce($3, note)
          where id = $1 and workspace_id = $2`,
        [orderId, context.workspaceId, input.reason ?? null],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'purchase_order.closed',
      objectType: 'purchase_order',
      objectId: String(orderId),
    })

    return reply.code(200).send({ message: 'PO ditutup.' })
  })
}

/* Penerimaan barang ---------------------------------------------------------- */

function registerReceiptRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/workspaces/:workspaceId/goods-receipts', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'suppliers.manage')
    const input = createReceiptSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      const ulangan = await tx.query<{ response_body: { receiptId: number; number: string; movements: unknown[] } | null }>(
        `select response_body from idempotency_keys
          where workspace_id = $1 and operation = 'goods_receipt.create' and key = $2
            and completed_at is not null`,
        [context.workspaceId, input.idempotencyKey],
      )
      if (ulangan.rows[0]?.response_body) {
        return { replayed: true, ...ulangan.rows[0].response_body }
      }

      const order = await tx.query<{
        id: string
        number: string
        status: string
        supplier_id: number
        location_id: number
        received_total: string
      }>(
        `select id, number, status, supplier_id, location_id, received_total
           from purchase_orders
          where id = $1 and workspace_id = $2
          for update`,
        [input.purchaseOrderId, context.workspaceId],
      )
      const po = order.rows[0]
      if (!po) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }
      if (po.status !== 'disetujui' && po.status !== 'diterima_sebagian') {
        throw new StockError(
          'po_bukan_diterima',
          `Barang hanya bisa diterima untuk PO berstatus Disetujui atau Diterima Sebagian. PO ini berstatus ${orderStatusLabels[po.status] ?? po.status}.`,
        )
      }

      const receivedOn = input.receivedOn
        ? new Date(`${input.receivedOn}T00:00:00.000Z`)
        : await todayInWorkspace(tx, context.workspaceId)
      const locationId = input.locationId ?? po.location_id

      const number = await allocateDocumentNumber(tx, context.workspaceId, 'penerimaan', receivedOn)

      const receipt = await tx.query<{ id: string }>(
        `insert into goods_receipts
           (workspace_id, purchase_order_id, supplier_id, location_id, number, received_on, note, received_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          context.workspaceId,
          input.purchaseOrderId,
          po.supplier_id,
          locationId,
          number,
          toDateString(receivedOn),
          input.note ?? null,
          session.userId,
        ],
      )
      const receiptId = receipt.rows[0]!.id

      const movements: Array<{ productId: number; movementId: number; balanceAfter: number }> = []

      for (const item of input.items) {
        const orderItem = await tx.query<{ id: string; unit_price: string; quantity: string; received_quantity: string }>(
          `select id, unit_price, quantity, received_quantity
             from purchase_order_items
            where purchase_order_id = $1 and product_id = $2 and workspace_id = $3`,
          [input.purchaseOrderId, item.productId, context.workspaceId],
        )
        const target = orderItem.rows[0]
        if (!target) {
          throw new StockError(
            'barang_tidak_ada_di_po',
            'Ada barang pada penerimaan ini yang tidak ada di PO-nya.',
            400,
          )
        }

        const remaining = asNumber(target.quantity) - asNumber(target.received_quantity)
        if (item.quantity > remaining) {
          throw new StockError(
            'melebihi_jumlah_po',
            `Jumlah diterima untuk satu barang melebihi sisa di PO.`,
            409,
            { remaining },
          )
        }

        const unitPrice = asNumber(target.unit_price)

        // Stok bertambah hanya sebesar jumlah yang benar-benar diterima.
        const movement = await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: item.productId,
          locationId,
          kind: 'masuk',
          direction: 'tambah',
          quantity: item.quantity,
          unitCost: unitPrice,
          expiresAt: item.expiresAt,
          reasonCode: 'pembelian',
          reference: po.number,
          note: input.note ?? null,
          occurredOn: toDateString(receivedOn),
          actorUserId: session.userId,
        })

        await tx.query(
          `insert into goods_receipt_items
             (workspace_id, goods_receipt_id, product_id, quantity, unit_price, unit_cost, expires_at, stock_movement_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            context.workspaceId,
            receiptId,
            item.productId,
            item.quantity,
            item.unitPrice ?? unitPrice,
            unitPrice,
            item.expiresAt ?? null,
            movement.movementId,
          ],
        )

        await tx.query(
          `update purchase_order_items
              set received_quantity = received_quantity + $1
            where id = $2 and workspace_id = $3`,
          [item.quantity, target.id, context.workspaceId],
        )

        movements.push({
          productId: item.productId,
          movementId: movement.movementId,
          balanceAfter: movement.balanceAfter,
        })
      }

      // Utang supplier bertambah sebesar nilai barang yang diterima.
      const nilai = await tx.query<{ total: number }>(
        `select sum(unit_cost * quantity)::bigint as total
           from goods_receipt_items
          where workspace_id = $1 and goods_receipt_id = $2`,
        [context.workspaceId, receiptId],
      )

      await tx.query(
        `insert into supplier_debt_entries
           (workspace_id, supplier_id, purchase_order_id, goods_receipt_id, amount, entry_date, note)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          context.workspaceId,
          po.supplier_id,
          input.purchaseOrderId,
          receiptId,
          asNumber(nilai.rows[0]?.total),
          toDateString(receivedOn),
          `Penerimaan ${number}`,
        ],
      )

      const updated = await tx.query<{ received_total: string }>(
        `update purchase_orders set received_total = received_total + $1
          where id = $2 and workspace_id = $3
          returning received_total`,
        [
          input.items.reduce((jumlah, item) => jumlah + item.quantity, 0),
          input.purchaseOrderId,
          context.workspaceId,
        ],
      )

      const totalReceived = asNumber(updated.rows[0]?.received_total)

      const selesai = await tx.query<{ total: string }>(
        `select coalesce(sum(quantity), 0)::text as total
           from purchase_order_items
          where purchase_order_id = $1 and workspace_id = $2`,
        [input.purchaseOrderId, context.workspaceId],
      )
      const semuaDiterima = asNumber(selesai.rows[0]?.total) <= totalReceived

      await tx.query(
        `update purchase_orders set status = $1 where id = $2 and workspace_id = $3`,
        [semuaDiterima ? 'diterima' : 'diterima_sebagian', input.purchaseOrderId, context.workspaceId],
      )

      const body = {
        receiptId: Number(receiptId),
        number,
        orderStatus: semuaDiterima ? 'diterima' : 'diterima_sebagian',
        movements,
      }

      await tx.query(
        `insert into idempotency_keys
           (workspace_id, operation, key, request_hash, response_status, response_body, completed_at)
         values ($1, 'goods_receipt.create', $2, $3, 201, $4, now())
         on conflict (workspace_id, operation, key)
           do update set response_status = excluded.response_status,
                         response_body = excluded.response_body,
                         completed_at = now()`,
        [
          context.workspaceId,
          input.idempotencyKey,
          hashBody(input),
          JSON.stringify(body),
        ],
      )

      return { replayed: false, ...body }
    })

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: session.userId,
        actorRole: context.role,
        action: 'goods_receipt.created',
        objectType: 'goods_receipt',
        objectId: String(hasil.receiptId),
        metadata: { orderId: input.purchaseOrderId, items: input.items.length },
      })
    }

    return reply.code(hasil.replayed ? 200 : 201).send(hasil)
  })

  app.get('/api/workspaces/:workspaceId/goods-receipts', async (request, reply) => {
    const context = await requireCapability(db, request, 'reports.purchasing')

    const receipts = await db.query<{
      id: string
      number: string
      received_on: string
      supplier_name: string
      location_name: string
      purchase_order_id: number | null
      order_number: string | null
    }>(
      `select gr.id, gr.number, to_char(gr.received_on, 'YYYY-MM-DD') as received_on,
              s.name as supplier_name, l.name as location_name,
              gr.purchase_order_id, o.number as order_number
         from goods_receipts gr
         join suppliers s on s.id = gr.supplier_id and s.workspace_id = gr.workspace_id
         join locations l on l.id = gr.location_id and l.workspace_id = gr.workspace_id
         left join purchase_orders o on o.id = gr.purchase_order_id and o.workspace_id = gr.workspace_id
        where gr.workspace_id = $1
        order by gr.received_on desc, gr.id desc
        limit 100`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      receipts: receipts.rows.map((row) => ({
        receiptId: Number(row.id),
        number: row.number,
        receivedOn: row.received_on,
        supplierName: row.supplier_name,
        locationName: row.location_name,
        purchaseOrderId: row.purchase_order_id,
        orderNumber: row.order_number,
      })),
    })
  })
}

/* Retur pembelian ------------------------------------------------------------ */

function registerReturnRoutes(app: FastifyInstance, db: Database): void {
  /**
   * A-03: retur mengurangi stok dan mengurangi utang pada PO terkait, dan ditolak
   * bila saldo di lokasi tidak cukup. Penolakan stok negatif dipegang
   * recordMovement, jadi pesan yang muncul sama dengan saat stok keluar biasa.
   */
  app.post('/api/workspaces/:workspaceId/purchase-returns', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'suppliers.manage')
    const input = createReturnSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'returns')
      const ulangan = await tx.query<{ response_body: { returnId: number; number: string } | null }>(
        `select response_body from idempotency_keys
          where workspace_id = $1 and operation = 'purchase_return.create' and key = $2
            and completed_at is not null`,
        [context.workspaceId, input.idempotencyKey],
      )
      if (ulangan.rows[0]?.response_body) {
        return { replayed: true, ...ulangan.rows[0].response_body }
      }

      const supplier = await tx.query(
        'select id from suppliers where id = $1 and workspace_id = $2 and not is_archived',
        [input.supplierId, context.workspaceId],
      )
      if (supplier.rows.length === 0) {
        throw new StockError('supplier_tidak_ditemukan', 'Supplier tidak ditemukan.', 404)
      }

      const returnedOn = input.returnedOn
        ? new Date(`${input.returnedOn}T00:00:00.000Z`)
        : await todayInWorkspace(tx, context.workspaceId)

      const number = await allocateDocumentNumber(tx, context.workspaceId, 'retur', returnedOn)

      const created = await tx.query<{ id: string }>(
        `insert into purchase_returns
           (workspace_id, purchase_order_id, supplier_id, location_id, number, returned_on, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          context.workspaceId,
          input.purchaseOrderId ?? null,
          input.supplierId,
          input.locationId,
          number,
          toDateString(returnedOn),
          input.note ?? null,
          session.userId,
        ],
      )
      const returnId = created.rows[0]!.id

      for (const item of input.items) {
        const harga =
          item.unitPrice ??
          (await hargaPenerimaan(tx, context.workspaceId, input.purchaseOrderId ?? null, item.productId))

        const movement = await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: item.productId,
          locationId: input.locationId,
          kind: 'keluar',
          direction: 'kurang',
          quantity: item.quantity,
          reasonCode: 'retur_pembelian',
          reference: number,
          note: input.note ?? null,
          occurredOn: toDateString(returnedOn),
          actorUserId: session.userId,
        })

        await tx.query(
          `insert into purchase_return_items
             (workspace_id, purchase_return_id, product_id, quantity, unit_price, stock_movement_id)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            context.workspaceId,
            returnId,
            item.productId,
            item.quantity,
            harga,
            movement.movementId,
          ],
        )

        // Utang supplier berkurang. Nilainya negatif karena retur mengurangi apa yang
        // masih terutang, dan batasan di database menjaga nilainya tidak melebihi
        // penerimaan yang terkait.
        if (input.purchaseOrderId) {
          await tx.query(
            `insert into supplier_debt_entries
               (workspace_id, supplier_id, purchase_order_id, purchase_return_id, amount, entry_date, note)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              context.workspaceId,
              input.supplierId,
              input.purchaseOrderId,
              returnId,
              -roundRupiah(harga * item.quantity),
              toDateString(returnedOn),
              `Retur ${number}`,
            ],
          )
        }
      }

      const body = { returnId: Number(returnId), number }

      await tx.query(
        `insert into idempotency_keys
           (workspace_id, operation, key, request_hash, response_status, response_body, completed_at)
         values ($1, 'purchase_return.create', $2, $3, 201, $4, now())
         on conflict (workspace_id, operation, key)
           do update set response_status = excluded.response_status,
                         response_body = excluded.response_body,
                         completed_at = now()`,
        [context.workspaceId, input.idempotencyKey, hashBody(input), JSON.stringify(body)],
      )

      return { replayed: false, ...body }
    })

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: session.userId,
        actorRole: context.role,
        action: 'purchase_return.created',
        objectType: 'purchase_return',
        objectId: String(hasil.returnId),
      })
    }

    return reply.code(hasil.replayed ? 200 : 201).send(hasil)
  })
}

async function hargaPenerimaan(
  tx: Transaction,
  workspaceId: number,
  orderId: number | null,
  productId: number,
): Promise<number> {
  if (orderId) {
    const dariPo = await tx.query<{ unit_price: string }>(
      `select unit_price from purchase_order_items
        where purchase_order_id = $1 and product_id = $2 and workspace_id = $3`,
      [orderId, productId, workspaceId],
    )
    if (dariPo.rows[0]) {
      return asNumber(dariPo.rows[0].unit_price)
    }
  }

  const terakhir = await tx.query<{ unit_cost: string | null }>(
    `select unit_cost from goods_receipt_items
      where product_id = $1 and workspace_id = $2 and unit_cost is not null
      order by id desc limit 1`,
    [productId, workspaceId],
  )

  return asNumber(terakhir.rows[0]?.unit_cost)
}

/* Pembayaran supplier -------------------------------------------------------- */

function registerPaymentRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/workspaces/:workspaceId/supplier-payments', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'suppliers.manage')
    const input = createPaymentSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'returns')
      const paidOn = input.paidOn
        ? new Date(`${input.paidOn}T00:00:00.000Z`)
        : await todayInWorkspace(tx, context.workspaceId)

      const number = await allocateDocumentNumber(tx, context.workspaceId, 'pembayaran', paidOn)

      const created = await tx.query<{ id: string }>(
        `insert into supplier_payments
           (workspace_id, supplier_id, purchase_order_id, number, paid_on, amount, method, reference, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          context.workspaceId,
          input.supplierId,
          input.purchaseOrderId ?? null,
          number,
          toDateString(paidOn),
          input.amount,
          input.method,
          input.reference ?? null,
          input.note ?? null,
          session.userId,
        ],
      )
      const paymentId = created.rows[0]!.id

      // A-08: pembayaran tanpa PO yang dipilih dialokasikan otomatis dengan urutan
      // jatuh tempo lalu nomor PO, dan alokasinya disimpan supaya bisa ditinjau
      // dan dibatalkan Owner.
      const alokasi = input.purchaseOrderId
        ? [{ orderId: input.purchaseOrderId, amount: input.amount }]
        : await allocatePaymentFifo(tx, context.workspaceId, input.supplierId, input.amount)

      for (const item of alokasi) {
        await tx.query(
          `insert into supplier_payment_allocations
             (workspace_id, supplier_payment_id, purchase_order_id, amount)
           values ($1, $2, $3, $4)`,
          [context.workspaceId, paymentId, item.orderId, item.amount],
        )
      }

      return {
        paymentId: Number(paymentId),
        number,
        allocations: alokasi.map((item) => ({ orderId: item.orderId, amount: item.amount })),
      }
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'supplier_payment.created',
      objectType: 'supplier_payment',
      objectId: String(hasil.paymentId),
      metadata: { amount: input.amount, allocations: hasil.allocations.length },
    })

    return reply.code(201).send(hasil)
  })

  app.get('/api/workspaces/:workspaceId/supplier-debts', async (request, reply) => {
    const context = await requireCapability(db, request, 'reports.debt')
    const rows = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      await assertFeature(tx, context.workspaceId, 'returns')
      return tx.query<{
        supplier_id: number
        supplier_name: string
        purchase_order_id: number | null
        order_number: string | null
        due_on: string | null
        debt: number
        paid: number
        overdue_days: number | null
      }>(
        `select e.supplier_id, s.name as supplier_name,
                e.purchase_order_id, o.number as order_number,
                case when s.payment_term_days is not null
                     then to_char(min(e.entry_date + s.payment_term_days), 'YYYY-MM-DD')
                end as due_on,
                sum(e.amount) as debt,
                coalesce((
                  select sum(a.amount) from supplier_payment_allocations a
                   where a.workspace_id = $1 and a.purchase_order_id = e.purchase_order_id
                ), 0) as paid,
                case when s.payment_term_days is not null
                     then greatest(0, (current_date - min(e.entry_date + s.payment_term_days))::int)
                end as overdue_days
           from supplier_debt_entries e
           join suppliers s on s.id = e.supplier_id and s.workspace_id = e.workspace_id
           left join purchase_orders o on o.id = e.purchase_order_id and o.workspace_id = e.workspace_id
          where e.workspace_id = $1
          group by e.supplier_id, s.name, e.purchase_order_id, o.number, s.payment_term_days
         having sum(e.amount) - coalesce((
                  select sum(a.amount) from supplier_payment_allocations a
                   where a.workspace_id = $1 and a.purchase_order_id = e.purchase_order_id
                ), 0) <> 0
          order by overdue_days desc nulls last, s.name asc`,
        [context.workspaceId],
      )
    })

    return reply.code(200).send({
      debts: rows.rows.map((row) => {
        const received = asNumber(row.debt)
        const paid = asNumber(row.paid)
        return {
          supplierId: row.supplier_id,
          supplierName: row.supplier_name,
          purchaseOrderId: row.purchase_order_id,
          orderNumber: row.order_number,
          dueOn: row.due_on,
          receivedValue: received,
          paidValue: paid,
          outstanding: received - paid,
          overdueDays: row.overdue_days,
        }
      }),
    })
  })

}

/* Helper --------------------------------------------------------------------- */

interface SupplierRow {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  payment_term_days: number | null
  note: string | null
  is_archived: boolean
  debt: number | null
}

interface OrderRow {
  id: string
  number: string
  status: string
  ordered_on: string
  expected_on: string | null
  total_amount: number
  received_total: string
  ordered_total: string
  note: string | null
  created_at: Date
  approved_at: Date | null
  supplier_id: number
  supplier_name: string
  location_id: number
  location_name: string
  created_by_name: string
}

interface OrderItemRow {
  id: string
  product_id: number
  product_name: string
  sku: string
  unit_code: string
  quantity: string
  unit_price: string
  discount_amount: string
  line_total: string
  received_quantity: string
  note: string | null
}

export const orderStatusLabels: Record<string, string> = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
  diterima_sebagian: 'Diterima Sebagian',
  diterima: 'Diterima',
  ditutup: 'Ditutup',
}

function supplierRow(row: SupplierRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    paymentTermDays: row.payment_term_days,
    note: row.note,
    archived: row.is_archived,
    outstanding: row.debt === null ? null : asNumber(row.debt),
  }
}

function orderRow(row: OrderRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    number: row.number,
    status: row.status,
    statusLabel: orderStatusLabels[row.status] ?? row.status,
    orderedOn: row.ordered_on,
    expectedOn: row.expected_on,
    totalAmount: asNumber(row.total_amount),
    receivedTotal: asNumber(row.received_total),
    orderedTotal: asNumber(row.ordered_total),
    note: row.note,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    locationId: row.location_id,
    locationName: row.location_name,
    createdByName: row.created_by_name,
  }
}

type OrderItemLike = {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount: number | null
  note?: string | null | undefined
}

/** Total dihitung per baris dan dibulatkan ke rupiah penuh (KEPUTUSAN-TEKNIS bagian 3). */
function totalOf(items: OrderItemLike[]): number {
  return items.reduce(
    (jumlah, item) =>
      jumlah + roundRupiah(item.unitPrice * item.quantity - (item.discountAmount ?? 0)),
    0,
  )
}

async function replaceItems(
  tx: Transaction,
  workspaceId: number,
  orderId: string | number,
  items: OrderItemLike[],
): Promise<void> {
  const seen = new Set<number>()
  for (const item of items) {
    if (seen.has(item.productId)) {
      throw new StockError(
        'barang_ganda_di_po',
        'Satu barang tidak boleh muncul dua kali di PO yang sama.',
        400,
      )
    }
    seen.add(item.productId)
  }

  await tx.query('delete from purchase_order_items where purchase_order_id = $1 and workspace_id = $2', [
    orderId,
    workspaceId,
  ])

  for (const item of items) {
    const produk = await tx.query<{ id: number }>(
      'select id from products where id = $1 and workspace_id = $2',
      [item.productId, workspaceId],
    )
    if (produk.rows.length === 0) {
      throw new StockError('produk_tidak_ditemukan', 'Produk tidak ditemukan.', 404)
    }

    await tx.query(
      `insert into purchase_order_items
         (workspace_id, purchase_order_id, product_id, quantity, unit_price, discount_amount, line_total, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        workspaceId,
        orderId,
        item.productId,
        item.quantity,
        item.unitPrice,
        item.discountAmount ?? 0,
        roundRupiah(item.unitPrice * item.quantity - (item.discountAmount ?? 0)),
        item.note ?? null,
      ],
    )
  }
}

async function catatRevisi(
  tx: Transaction,
  workspaceId: number,
  orderId: string | number,
  reason: string,
  actorUserId: number,
  snapshot: unknown,
): Promise<void> {
  const last = await tx.query<{ revision_number: number }>(
    `select coalesce(max(revision_number), 0) as revision_number
       from purchase_order_revisions
      where purchase_order_id = $1 and workspace_id = $2`,
    [orderId, workspaceId],
  )

  await tx.query(
    `insert into purchase_order_revisions
       (workspace_id, purchase_order_id, revision_number, reason, changed_by, snapshot)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      workspaceId,
      orderId,
      Number(last.rows[0]?.revision_number ?? 0) + 1,
      reason,
      actorUserId,
      JSON.stringify(snapshot),
    ],
  )
}

/**
 * A-08: alokasi FIFO berdasarkan jatuh tempo lalu nomor PO. Jumlah yang dialokasikan
 * tidak pernah melebihi sisa utang PO itu, jadi pembayaran yang lebih besar dari
 * utang hanya membayar PO yang bisa dilunasi, dan sisanya tercatat sebagai
 * pembayaran yang belum dialokasikan.
 */
async function allocatePaymentFifo(
  tx: Transaction,
  workspaceId: number,
  supplierId: number,
  amount: number,
): Promise<Array<{ orderId: number; amount: number }>> {
  const utang = await tx.query<{ purchase_order_id: number; sisa: number }>(
    `select e.purchase_order_id,
            sum(e.amount)
              - coalesce((
                  select sum(a.amount) from supplier_payment_allocations a
                   where a.workspace_id = $1
                     and a.purchase_order_id = e.purchase_order_id
                ), 0) as sisa
       from supplier_debt_entries e
      where e.workspace_id = $1 and e.supplier_id = $2 and e.purchase_order_id is not null
      group by e.purchase_order_id
     having sum(e.amount) - coalesce((
              select sum(a.amount) from supplier_payment_allocations a
               where a.workspace_id = $1
                 and a.purchase_order_id = e.purchase_order_id
            ), 0) > 0
      order by min(e.entry_date) asc`,
    [workspaceId, supplierId],
  )

  let sisa = amount
  const hasil: Array<{ orderId: number; amount: number }> = []

  for (const row of utang.rows) {
    if (sisa <= 0) break
    const dialokasikan = Math.min(Number(row.sisa), sisa)
    hasil.push({ orderId: row.purchase_order_id, amount: dialokasikan })
    sisa -= dialokasikan
  }

  return hasil
}

/**
 * Hash badan permintaan untuk tabel idempotency_keys. Kunci yang sama dengan badan
 * berbeda akan terlihat bedanya, jadi kunci yang sama tidak diam-diam dipakai untuk
 * dua permintaan yang tidak sama.
 */
function hashBody(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

export function paramsOf(request: FastifyRequest): Record<string, string> {
  return (request.params ?? {}) as Record<string, string>
}

export function idFrom(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new StockError('data_tidak_valid', 'Alamat tidak valid.', 400)
  }
  return value
}

export async function requireCapability(
  db: Database,
  request: FastifyRequest,
  capability: Parameters<typeof can>[1],
): Promise<WorkspaceContext> {
  const workspaceId = idFrom(paramsOf(request).workspaceId)
  const { workspaceId: id, role, userId } = await loadWorkspaceRole(db, request, workspaceId)

  if (!can(role, capability)) {
    throw new AuthorizationError('Anda tidak punya izin untuk tindakan ini.')
  }

  // Purchasing boleh menyetujui PO kalau workspace mengizinkan dan paketnya punya
  // persetujuan (B-03). Tanpa itu, ajakan ke purchasing tidak ada artinya.
  if (capability === 'purchase_orders.approve' && grantFor(role, capability) === 'partial') {
    const pengaturan = await db.query<{ approval_required: boolean }>(
      'select approval_required from workspace_settings where workspace_id = $1',
      [id],
    )
    if (!pengaturan.rows[0]?.approval_required) {
      throw new AuthorizationError(
        'Persetujuan PO untuk peran Purchasing belum diaktifkan di pengaturan workspace.',
      )
    }
  }

  return { workspaceId: id, role, userId }
}
