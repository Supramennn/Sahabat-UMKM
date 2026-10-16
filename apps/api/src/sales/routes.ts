import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { can, type Role } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { queryFlag } from '../common/http.ts'
import { asNumber, StockError } from '../stock/movements.ts'
import { idFrom, paramsOf, requireCapability } from '../purchasing/routes.ts'
import { todayInWorkspace, toDateString } from '../purchasing/documents.ts'
import {
  cancelSaleSchema,
  createCustomerSchema,
  createPaymentMethodSchema,
  createSaleSchema,
  listSalesQuerySchema,
  updateCustomerSchema,
  updatePaymentMethodSchema,
} from './schemas.ts'
import { cancelSale, createSale } from './service.ts'
import { ensureFeature } from '../plans/service.ts'

/**
 * Endpoint penjualan dan pelanggan (PRD 6.4).
 *
 * Setiap handler mengambil konteks lewat requireCapability, jadi izin dicek di server
 * dan setiap kueri sudah dibatasi ke workspace aktif. Menyembunyikan tombol di
 * tampilan bukan kontrol keamanan (PRD 8).
 */

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  note: string | null
  is_archived: boolean
  sale_count: string
  sale_total: string
}

interface PaymentMethodRow {
  id: string
  name: string
  is_archived: boolean
}

export function registerSalesRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  registerCustomerRoutes(app, db)
  registerPaymentMethodRoutes(app, db)
  registerSaleRoutes(app, db)
}

interface SalesContext {
  workspaceId: number
  role: Role
  userId: number
}

/**
 * Membaca penjualan butuh salah satu dari dua izin, bukan satu.
 *
 * Daftar penjualan bukan laporan, jadi staf yang mencatat penjualan harus bisa
 * membacanya. Viewer tidak boleh mencatat penjualan, tapi boleh membaca laporan
 * penjualan (PRD 8), jadi daftar penjualan juga boleh ia lihat. Purchasing memakai
 * sales.record untuk menulis dan reports.sales untuk membaca, lewat izin yang sama
 * dengan modul lain.
 */
async function requireSalesRead(db: Database, request: FastifyRequest): Promise<SalesContext> {
  const workspaceId = idFrom(paramsOf(request).workspaceId)
  const { workspaceId: id, role, userId } = await loadWorkspaceRole(db, request, workspaceId)

  const boleh =
    can(role, 'sales.record') || can(role, 'reports.sales')

  if (!boleh) {
    throw new AuthorizationError('Anda tidak punya izin untuk melihat penjualan.')
  }

  return { workspaceId: id, role, userId }
}

/** B-07: daftar metode pembayaran hanya boleh diubah Owner. */
async function requireOwner(db: Database, request: FastifyRequest): Promise<SalesContext> {
  const workspaceId = idFrom(paramsOf(request).workspaceId)
  const { workspaceId: id, role, userId } = await loadWorkspaceRole(db, request, workspaceId)

  if (role !== 'owner') {
    throw new AuthorizationError('Hanya Owner yang bisa mengatur daftar ini.')
  }

  return { workspaceId: id, role, userId }
}

function registerCustomerRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/customers', async (request) => {
    const context = await requireCapability(db, request, 'products.manage')
    const params = paramsOf(request)
    const includeArchived = params.archived === 'true'

    const customers = await db.query<CustomerRow>(
      `select c.id, c.name, c.phone, c.note, c.is_archived,
              count(s.id) as sale_count,
              coalesce(sum(s.total_amount) filter (where s.status = 'selesai'), 0) as sale_total
         from customers c
         left join sales s on s.customer_id = c.id and s.workspace_id = c.workspace_id
        where c.workspace_id = $1 and ($2 or not c.is_archived)
        group by c.id
        order by lower(c.name)`,
      [context.workspaceId, includeArchived],
    )

    return {
      customers: customers.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        phone: row.phone,
        note: row.note,
        archived: row.is_archived,
        saleCount: Number(row.sale_count),
        saleTotal: asNumber(row.sale_total),
      })),
    }
  })

  app.post('/api/workspaces/:workspaceId/customers', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')
    const input = createCustomerSchema.parse(request.body)

    const created = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      return tx.query<{ id: string }>(
        `insert into customers (workspace_id, name, phone, note)
         values ($1, $2, $3, $4)
         returning id`,
        [context.workspaceId, input.name, input.phone, input.note],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: request.sessionUser?.userId ?? null,
      actorRole: context.role,
      action: 'customer.create',
      objectType: 'customer',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ customerId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/customers/:customerId', async (request) => {
    const context = await requireCapability(db, request, 'sales.record')
    const customerId = idFrom(paramsOf(request).customerId)
    const input = updateCustomerSchema.parse(request.body)

    const updated = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      return tx.query<{ is_archived: boolean }>(
      `update customers
          set name = coalesce($3, name),
              phone = case when $4 then $5 else phone end,
              note = case when $6 then $7 else note end,
              is_archived = coalesce($8, is_archived)
        where id = $1 and workspace_id = $2
        returning is_archived`,
      [
        customerId,
        context.workspaceId,
        input.name ?? null,
        input.phone !== undefined,
        input.phone ?? null,
        input.note !== undefined,
        input.note ?? null,
        input.isArchived ?? null,
      ],
    )
    })

    if (!updated.rows[0]) {
      throw new StockError('pelanggan_tidak_ditemukan', 'Pelanggan tidak ditemukan.', 404)
    }

    return { archived: updated.rows[0].is_archived }
  })
}

function registerPaymentMethodRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/payment-methods', async (request) => {
    const context = await requireCapability(db, request, 'products.manage')
    const includeArchived = queryFlag(request, 'archived')

    const methods = await db.query<PaymentMethodRow>(
      `select id, name, is_archived
         from payment_methods
        where workspace_id = $1 and ($2 or not is_archived)
        order by lower(name)`,
      [context.workspaceId, includeArchived],
    )

    return {
      paymentMethods: methods.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        archived: row.is_archived,
      })),
    }
  })

  // B-07: metode pembayaran diatur Owner. Admin dan staf tidak boleh mengubah daftar
  // karena daftar ini memengaruhi laporan penjualan pada periode yang sedang ditutup.
  app.post('/api/workspaces/:workspaceId/payment-methods', async (request, reply) => {
    const context = await requireOwner(db, request)
    const input = createPaymentMethodSchema.parse(request.body)

    const created = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      return tx.query<{ id: string }>(
      `insert into payment_methods (workspace_id, name) values ($1, $2) returning id`,
      [context.workspaceId, input.name],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: request.sessionUser?.userId ?? null,
      actorRole: context.role,
      action: 'payment_method.create',
      objectType: 'payment_method',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ paymentMethodId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/payment-methods/:methodId', async (request) => {
    const context = await requireOwner(db, request)
    const methodId = idFrom(paramsOf(request).methodId)
    const input = updatePaymentMethodSchema.parse(request.body)

    const updated = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      return tx.query(
      `update payment_methods
          set name = coalesce($3, name),
              is_archived = coalesce($4, is_archived)
        where id = $1 and workspace_id = $2`,
      [methodId, context.workspaceId, input.name ?? null, input.isArchived ?? null],
      )
    })

    if (updated.affected === 0) {
      throw new StockError('metode_tidak_ditemukan', 'Metode pembayaran tidak ditemukan.', 404)
    }

    return { ok: true }
  })
}

function registerSaleRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/sales', async (request) => {
    const context = await requireSalesRead(db, request)
    const query = listSalesQuerySchema.parse(request.query ?? {})

    const filters = ['s.workspace_id = $1']
    const values: unknown[] = [context.workspaceId]

    if (query.from) {
      values.push(query.from)
      filters.push(`s.sold_on >= $${values.length}`)
    }
    if (query.to) {
      values.push(query.to)
      filters.push(`s.sold_on <= $${values.length}`)
    }
    if (query.locationId) {
      values.push(query.locationId)
      filters.push(`s.location_id = $${values.length}`)
    }
    if (query.customerId) {
      values.push(query.customerId)
      filters.push(`s.customer_id = $${values.length}`)
    }
    if (query.status !== 'semua') {
      values.push(query.status)
      filters.push(`s.status = $${values.length}`)
    }

    const where = filters.join(' and ')

    const total = await db.query<{ total: string }>(
      `select count(*) as total from sales s where ${where}`,
      values,
    )

    const rows = await db.query<{
      id: string
      number: string
      sold_on: string
      location_name: string
      customer_name: string | null
      payment_method_label: string
      total_amount: string
      cost_total: string
      status: string
      item_count: string
    }>(
      `select s.id, s.number, to_char(s.sold_on, 'YYYY-MM-DD') as sold_on, l.name as location_name,
              c.name as customer_name, s.payment_method_label,
              s.total_amount, s.cost_total, s.status,
              (select count(*) from sale_items si where si.sale_id = s.id) as item_count
         from sales s
         join locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
         left join customers c on c.id = s.customer_id and c.workspace_id = s.workspace_id
        where ${where}
        order by s.sold_on desc, s.id desc
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.limit, query.offset],
    )

    return {
      sales: rows.rows.map((row) => {
        const totalAmount = asNumber(row.total_amount)
        const costTotal = asNumber(row.cost_total)
        return {
          id: Number(row.id),
          number: row.number,
          soldOn: row.sold_on,
          locationName: row.location_name,
          customerName: row.customer_name,
          paymentMethodLabel: row.payment_method_label,
          totalAmount,
          costTotal,
          grossProfit: totalAmount - costTotal,
          status: row.status,
          statusLabel: row.status === 'dibatalkan' ? 'Dibatalkan' : 'Selesai',
          itemCount: Number(row.item_count),
        }
      }),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(total.rows[0]?.total ?? 0),
      },
    }
  })

  app.post('/api/workspaces/:workspaceId/sales', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')
    const input = createSaleSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      const hariIni = input.soldOn ?? toDateString(await todayInWorkspace(tx, context.workspaceId))

      if (input.customerId) {
        const ada = await tx.query(
          'select 1 from customers where id = $1 and workspace_id = $2 and not is_archived',
          [input.customerId, context.workspaceId],
        )
        if (ada.rows.length === 0) {
          throw new StockError('pelanggan_tidak_ditemukan', 'Pelanggan tidak ditemukan.', 404)
        }
      }

      if (input.paymentMethodId) {
        const ada = await tx.query(
          'select 1 from payment_methods where id = $1 and workspace_id = $2 and not is_archived',
          [input.paymentMethodId, context.workspaceId],
        )
        if (ada.rows.length === 0) {
          throw new StockError(
            'metode_tidak_ditemukan',
            'Metode pembayaran tidak ditemukan. Pilih dari daftar atau ketik nama lain.',
            404,
          )
        }
      }

      return createSale(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        soldOn: hariIni,
        locationId: input.locationId,
        customerId: input.customerId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        paymentMethodLabel: input.paymentMethodLabel,
        note: input.note,
        items: input.items,
        idempotencyKey: input.idempotencyKey,
      })
    })

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorRole: context.role,
        action: 'sale.create',
        objectType: 'sale',
        objectId: String(hasil.saleId),
        metadata: { number: hasil.number, totalAmount: hasil.totalAmount },
      })
    }

    return reply.code(201).send(hasil)
  })

  app.get('/api/workspaces/:workspaceId/sales/:saleId', async (request) => {
    const context = await requireSalesRead(db, request)
    const saleId = idFrom(paramsOf(request).saleId)

    const sale = await db.query<{
      id: string
      number: string
      sold_on: string
      location_id: string
      location_name: string
      customer_id: string | null
      customer_name: string | null
      payment_method_label: string
      subtotal: string
      discount_total: string
      total_amount: string
      cost_total: string
      status: string
      cancel_reason: string | null
      cancelled_at: Date | null
      note: string | null
      created_by_name: string
    }>(
      `select s.id, s.number, to_char(s.sold_on, 'YYYY-MM-DD') as sold_on, s.location_id, l.name as location_name,
              s.customer_id, c.name as customer_name, s.payment_method_label,
              s.subtotal, s.discount_total, s.total_amount, s.cost_total,
              s.status, s.cancel_reason, s.cancelled_at, s.note,
              coalesce(u.name, 'Akun dihapus') as created_by_name
         from sales s
         join locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
         left join customers c on c.id = s.customer_id and c.workspace_id = s.workspace_id
         left join users u on u.id = s.created_by
        where s.id = $1 and s.workspace_id = $2`,
      [saleId, context.workspaceId],
    )

    const row = sale.rows[0]
    if (!row) {
      throw new StockError('penjualan_tidak_ditemukan', 'Penjualan tidak ditemukan.', 404)
    }

    const items = await db.query<{
      id: string
      product_id: string
      product_name: string
      sku: string
      unit_code: string
      quantity: string
      unit_price: string
      discount_amount: string
      line_total: string
      unit_cost_snapshot: string
      cost_total: string
      note: string | null
    }>(
      `select si.id, si.product_id, p.name as product_name, p.sku, p.unit_code,
              si.quantity, si.unit_price, si.discount_amount, si.line_total,
              si.unit_cost_snapshot, si.cost_total, si.note
         from sale_items si
         join products p on p.id = si.product_id and p.workspace_id = si.workspace_id
        where si.sale_id = $1 and si.workspace_id = $2
        order by si.id`,
      [saleId, context.workspaceId],
    )

    const totalAmount = asNumber(row.total_amount)
    const costTotal = asNumber(row.cost_total)

    return {
      sale: {
        id: Number(row.id),
        number: row.number,
        soldOn: row.sold_on,
        locationId: Number(row.location_id),
        locationName: row.location_name,
        customerId: row.customer_id ? Number(row.customer_id) : null,
        customerName: row.customer_name,
        paymentMethodLabel: row.payment_method_label,
        subtotal: asNumber(row.subtotal),
        discountTotal: asNumber(row.discount_total),
        totalAmount,
        costTotal,
        grossProfit: totalAmount - costTotal,
        status: row.status,
        statusLabel: row.status === 'dibatalkan' ? 'Dibatalkan' : 'Selesai',
        cancelReason: row.cancel_reason,
        cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
        note: row.note,
        createdByName: row.created_by_name,
      },
      items: items.rows.map((item) => ({
        id: Number(item.id),
        productId: Number(item.product_id),
        productName: item.product_name,
        sku: item.sku,
        unitCode: item.unit_code,
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unit_price),
        discountAmount: asNumber(item.discount_amount),
        lineTotal: asNumber(item.line_total),
        unitCostSnapshot: asNumber(item.unit_cost_snapshot),
        costTotal: asNumber(item.cost_total),
        note: item.note,
      })),
    }
  })

  app.post('/api/workspaces/:workspaceId/sales/:saleId/cancel', async (request) => {
    const context = await requireCapability(db, request, 'sales.record')
    const saleId = idFrom(paramsOf(request).saleId)
    const input = cancelSaleSchema.parse(request.body ?? {})

    const hasil = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'sales')
      const hariIni = input.cancelledOn ?? toDateString(await todayInWorkspace(tx, context.workspaceId))
      return cancelSale(tx, {
        workspaceId: context.workspaceId,
        saleId,
        actorUserId: context.userId,
        reason: input.reason ?? null,
        cancelledOn: hariIni,
      })
    })

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorRole: context.role,
        action: 'sale.cancel',
        objectType: 'sale',
        objectId: String(saleId),
        metadata: { number: hasil.number, reason: input.reason ?? null },
      })
    }

    return hasil
  })
}
