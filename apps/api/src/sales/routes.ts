import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import type { Database } from '@sahabat/db'
import { can, roundRupiah, type Role } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole, requireSession } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { StockError, recordMovement, asNumber } from '../stock/movements.ts'
import { allocateDocumentNumber, toDateString, todayInWorkspace } from '../purchasing/documents.ts'
import {
  cancelSaleSchema,
  createCustomerSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  createPaymentMethodSchema,
  createSaleSchema,
  importSalesSchema,
  listCustomersQuerySchema,
  listExpensesQuerySchema,
  listSalesQuerySchema,
  updateCustomerSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  updatePaymentMethodSchema,
} from './schemas.ts'

export interface WorkspaceContext {
  workspaceId: number
  role: Role
  userId: number
}

export function registerSalesRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  registerCustomerRoutes(app, db)
  registerSaleRoutes(app, db)
  registerExpenseRoutes(app, db)
  registerPaymentMethodRoutes(app, db)
  registerExpenseCategoryRoutes(app, db)
}

/* Pelanggan ---------------------------------------------------------------- */

function registerCustomerRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/customers', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')
    const query = listCustomersQuerySchema.parse(request.query ?? {})

    const where = ['c.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (!query.includeArchived) {
      where.push('c.is_archived = false')
    }

    const total = await db.query<{ total: number }>(
      `select count(*)::int as total from customers c where ${where.join(' and ')}`,
      params,
    )

    params.push(query.limit, query.offset)

    const customers = await db.query<CustomerRow>(
      `select c.id, c.name, c.phone, c.email, c.address, c.note, c.is_archived, c.created_at
         from customers c
        where ${where.join(' and ')}
        order by c.is_archived asc, c.name asc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      customers: customers.rows.map(customerRow),
      pagination: { limit: query.limit, offset: query.offset, total: total.rows[0]?.total ?? 0 },
    })
  })

  app.post('/api/workspaces/:workspaceId/customers', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'sales.record')
    const input = createCustomerSchema.parse(request.body)

    const created = await db.query<{ id: string }>(
      `insert into customers (workspace_id, name, phone, email, address, note)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        context.workspaceId,
        input.name,
        input.phone ?? null,
        input.email ?? null,
        input.address ?? null,
        input.note ?? null,
      ],
    ).catch((error: unknown) => {
      if ((error as { code?: string } | null)?.code === '23505') {
        throw new StockError('customer_sudah_ada', `Pelanggan ${input.name} sudah ada di workspace ini.`)
      }
      throw error
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'customer.created',
      objectType: 'customer',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ customerId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/customers/:customerId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'sales.record')
    const customerId = idFrom(paramsOf(request).customerId)
    const input = updateCustomerSchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, customerId]

    for (const [column, value] of Object.entries({
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
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
      `update customers set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
      params,
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Pelanggan tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'customer.updated',
      objectType: 'customer',
      objectId: String(customerId),
    })

    return reply.code(200).send({ message: 'Pelanggan sudah diperbarui.' })
  })
}

/* Penjualan ---------------------------------------------------------------- */

function registerSaleRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/sales', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')
    const query = listSalesQuerySchema.parse(request.query ?? {})

    const filters = ['s.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (query.status === 'active') {
      filters.push('s.is_cancelled = false')
    } else if (query.status === 'cancelled') {
      filters.push('s.is_cancelled = true')
    }
    if (query.customerId) {
      params.push(query.customerId)
      filters.push('s.customer_id = $' + params.length)
    }
    if (query.locationId) {
      params.push(query.locationId)
      filters.push('s.location_id = $' + params.length)
    }
    if (query.dateFrom) {
      params.push(query.dateFrom)
      filters.push('s.sold_on >= $' + params.length)
    }
    if (query.dateTo) {
      params.push(query.dateTo)
      filters.push('s.sold_on <= $' + params.length)
    }

    const total = await db.query<{ total: number }>(
      `select count(*)::int as total from sales s where ${filters.join(' and ')}`,
      params,
    )

    params.push(query.limit, query.offset)

    const sales = await db.query<SaleRow>(
      `select s.id, s.number, s.is_cancelled, s.sold_on, s.payment_method, s.total_amount,
              s.total_cogs, s.gross_profit, s.note, s.created_at,
              s.customer_id, c.name as customer_name,
              s.location_id, l.name as location_name,
              u.name as created_by_name
         from sales s
         left join customers c on c.id = s.customer_id and c.workspace_id = s.workspace_id
         join locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
         join users u on u.id = s.created_by
        where ${filters.join(' and ')}
        order by s.sold_on desc, s.id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      sales: sales.rows.map(saleRow),
      pagination: { limit: query.limit, offset: query.offset, total: total.rows[0]?.total ?? 0 },
    })
  })

  app.post('/api/workspaces/:workspaceId/sales', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'sales.record')
    const input = createSaleSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      const idempotencyKey = input.idempotencyKey ?? `sale-${Date.now()}`
      const ulangan = await tx.query<{ response_body: { saleId: number; number: string; grossProfit: number } | null }>(
        `select response_body from idempotency_keys
          where workspace_id = $1 and operation = 'sale.create' and key = $2
            and completed_at is not null`,
        [context.workspaceId, idempotencyKey],
      )
      if (ulangan.rows[0]?.response_body) {
        return { replayed: true, ...ulangan.rows[0].response_body }
      }

      if (input.customerId) {
        const cust = await tx.query(
          'select id from customers where id = $1 and workspace_id = $2 and not is_archived',
          [input.customerId, context.workspaceId],
        )
        if (cust.rows.length === 0) {
          throw new StockError('customer_tidak_ditemukan', 'Pelanggan tidak ditemukan.', 404)
        }
      }

      const location = await tx.query(
        'select id from locations where id = $1 and workspace_id = $2 and not is_archived',
        [input.locationId, context.workspaceId],
      )
      if (location.rows.length === 0) {
        throw new StockError('lokasi_tidak_ditemukan', 'Lokasi tidak ditemukan.', 404)
      }

      const soldOn = input.soldOn
        ? new Date(`${input.soldOn}T00:00:00.000Z`)
        : await todayInWorkspace(tx, context.workspaceId)

      const number = await allocateDocumentNumber(tx, context.workspaceId, 'penjualan', soldOn)

      let totalAmount = 0
      let totalCogs = 0

      for (const item of input.items) {
        const lineTotal = roundRupiah(item.unitPrice * item.quantity - (item.discountAmount ?? 0))
        totalAmount += lineTotal
      }

      const sale = await tx.query<{ id: string }>(
        `insert into sales
           (workspace_id, customer_id, location_id, number, sold_on, payment_method, note, created_by, total_amount)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [
          context.workspaceId,
          input.customerId ?? null,
          input.locationId,
          number,
          toDateString(soldOn),
          input.paymentMethod,
          input.note ?? null,
          session.userId,
          totalAmount,
        ],
      )
      const saleId = sale.rows[0]!.id

      for (const item of input.items) {
        const product = await tx.query<{ id: number; unit_code: string; average_cost: string | null }>(
          `select p.id, p.unit_code, pc.average_cost
             from products p
             left join product_costs pc on pc.product_id = p.id and pc.workspace_id = p.workspace_id
            where p.id = $1 and p.workspace_id = $2`,
          [item.productId, context.workspaceId],
        )
        const prod = product.rows[0]
        if (!prod) {
          throw new StockError('produk_tidak_ditemukan', 'Produk tidak ditemukan.', 404)
        }

        const unitCogs = Number(prod.average_cost ?? 0)
        const lineTotal = roundRupiah(item.unitPrice * item.quantity - (item.discountAmount ?? 0))
        const lineCogs = roundRupiah(unitCogs * item.quantity)
        const lineGrossProfit = lineTotal - lineCogs

        // Kurangi stok (penjualan = stok keluar)
        const movement = await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: item.productId,
          locationId: input.locationId,
          kind: 'keluar',
          direction: 'kurang',
          quantity: item.quantity,
          reasonCode: 'penjualan',
          reference: number,
          note: input.note ?? null,
          occurredOn: toDateString(soldOn),
          actorUserId: session.userId,
        })

        await tx.query(
          `insert into sale_items
             (workspace_id, sale_id, product_id, quantity, unit_price, discount_amount, line_total,
              unit_cogs, line_cogs, line_gross_profit, stock_movement_id, note)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            context.workspaceId,
            saleId,
            item.productId,
            item.quantity,
            item.unitPrice,
            item.discountAmount ?? 0,
            lineTotal,
            unitCogs,
            lineCogs,
            lineGrossProfit,
            movement.movementId,
            item.note ?? null,
          ],
        )

        totalCogs += lineCogs
      }

      const grossProfit = totalAmount - totalCogs

      await tx.query(
        `update sales set total_cogs = $1, gross_profit = $2 where id = $3`,
        [totalCogs, grossProfit, saleId],
      )

      const body = { saleId: Number(saleId), number, grossProfit }

      await tx.query(
        `insert into idempotency_keys
           (workspace_id, operation, key, request_hash, response_status, response_body, completed_at)
         values ($1, 'sale.create', $2, $3, 201, $4, now())
         on conflict (workspace_id, operation, key)
           do update set response_status = excluded.response_status,
                         response_body = excluded.response_body,
                         completed_at = now()`,
        [
          context.workspaceId,
          idempotencyKey,
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
        action: 'sale.created',
        objectType: 'sale',
        objectId: String(hasil.saleId),
        metadata: { number: hasil.number, grossProfit: hasil.grossProfit },
      })
    }

    return reply.code(hasil.replayed ? 200 : 201).send(hasil)
  })

  app.get('/api/workspaces/:workspaceId/sales/:saleId', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')
    const saleId = idFrom(paramsOf(request).saleId)

    const sale = await db.query<SaleRow>(
      `select s.id, s.number, s.is_cancelled, s.sold_on, s.payment_method, s.total_amount,
              s.total_cogs, s.gross_profit, s.note, s.cancelled_reason, s.cancelled_at, s.created_at,
              s.customer_id, c.name as customer_name,
              s.location_id, l.name as location_name,
              u.name as created_by_name
         from sales s
         left join customers c on c.id = s.customer_id and c.workspace_id = s.workspace_id
         join locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
         join users u on u.id = s.created_by
        where s.workspace_id = $1 and s.id = $2`,
      [context.workspaceId, saleId],
    )
    const row = sale.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Penjualan tidak ditemukan.' })
    }

    const items = await db.query<SaleItemRow>(
      `select si.id, si.product_id, p.name as product_name, p.sku, p.unit_code,
              si.quantity, si.unit_price, si.discount_amount, si.line_total,
              si.unit_cogs, si.line_cogs, si.line_gross_profit, si.note
         from sale_items si
         join products p on p.id = si.product_id and p.workspace_id = si.workspace_id
        where si.workspace_id = $1 and si.sale_id = $2
        order by p.name asc`,
      [context.workspaceId, saleId],
    )

    return reply.code(200).send({
      sale: saleRow(row),
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
        unitCogs: asNumber(item.unit_cogs),
        lineCogs: asNumber(item.line_cogs),
        lineGrossProfit: asNumber(item.line_gross_profit),
        note: item.note,
      })),
    })
  })

  app.post('/api/workspaces/:workspaceId/sales/:saleId/cancel', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'sales.record')
    const saleId = idFrom(paramsOf(request).saleId)
    const input = cancelSaleSchema.parse(request.body)

    await db.transaction(async (tx) => {
      const sale = await tx.query<{ is_cancelled: boolean; number: string; location_id: number }>(
        'select is_cancelled, number, location_id from sales where id = $1 and workspace_id = $2 for update',
        [saleId, context.workspaceId],
      )
      const row = sale.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'Penjualan tidak ditemukan.', 404)
      }
      if (row.is_cancelled) {
        throw new StockError('sudah_dibatalkan', 'Penjualan ini sudah dibatalkan.')
      }

      // Kembalikan stok untuk setiap item (menggunakan snapshot unit_cogs)
      const items = await tx.query<{ product_id: number; quantity: string; unit_cogs: string }>(
        'select product_id, quantity, unit_cogs from sale_items where sale_id = $1 and workspace_id = $2',
        [saleId, context.workspaceId],
      )

      for (const item of items.rows) {
        await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: item.product_id,
          locationId: row.location_id,
          kind: 'masuk',
          direction: 'tambah',
          quantity: asNumber(item.quantity),
          unitCost: asNumber(item.unit_cogs),
          reasonCode: 'pembatalan_penjualan',
          reference: row.number,
          note: `Pembatalan: ${input.reason}`,
          occurredOn: toDateString(new Date()),
          actorUserId: session.userId,
        })
      }

      await tx.query(
        `update sales set is_cancelled = true, cancelled_reason = $1, cancelled_at = now() where id = $2 and workspace_id = $3`,
        [input.reason, saleId, context.workspaceId],
      )
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'sale.cancelled',
      objectType: 'sale',
      objectId: String(saleId),
      metadata: { reason: input.reason },
    })

    return reply.code(200).send({ message: 'Penjualan dibatalkan. Stok sudah dikembalikan.' })
  })

  app.post('/api/workspaces/:workspaceId/sales/import', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'data.import')
    const input = importSalesSchema.parse(request.body)

    const hasil = await db.transaction(async (tx) => {
      const ulangan = await tx.query<{ response_body: { imported: number; skipped: number } | null }>(
        `select response_body from idempotency_keys
          where workspace_id = $1 and operation = 'sale.import' and key = $2
            and completed_at is not null`,
        [context.workspaceId, input.idempotencyKey],
      )
      if (ulangan.rows[0]?.response_body) {
        return { replayed: true, ...ulangan.rows[0].response_body }
      }

      let imported = 0
      let skipped = 0

      for (const item of input.items) {
        // Cari produk by SKU
        const product = await tx.query<{ id: number; unit_code: string; average_cost: string | null }>(
          `select p.id, p.unit_code, pc.average_cost
             from products p
             left join product_costs pc on pc.product_id = p.id and pc.workspace_id = p.workspace_id
            where p.workspace_id = $1 and lower(p.sku) = lower($2)`,
          [context.workspaceId, item.sku],
        )
        if (product.rows.length === 0) {
          skipped++
          continue
        }
        const prod = product.rows[0]!

        // Cari atau buat pelanggan
        let customerId: number | null = null
        if (item.customerName) {
          const cust = await tx.query<{ id: number }>(
            `insert into customers (workspace_id, name, phone)
             values ($1, $2, $3)
             on conflict (workspace_id, lower(name)) do update set phone = excluded.phone
             returning id`,
            [context.workspaceId, item.customerName, item.customerPhone ?? null],
          )
          customerId = cust.rows[0]!.id
        }

        // Cari lokasi by name
        const location = await tx.query<{ id: number }>(
          'select id from locations where workspace_id = $1 and lower(name) = lower($2) and not is_archived',
          [context.workspaceId, item.locationName],
        )
        if (location.rows.length === 0) {
          skipped++
          continue
        }
        const locationId = location.rows[0]!.id

        const soldOn = new Date()
        const number = await allocateDocumentNumber(tx, context.workspaceId, 'penjualan', soldOn)

        const lineTotal = roundRupiah(item.unitPrice * item.quantity - (item.discountAmount ?? 0))
        const unitCogs = Number(prod.average_cost ?? 0)
        const lineCogs = roundRupiah(unitCogs * item.quantity)
        const lineGrossProfit = lineTotal - lineCogs

        const sale = await tx.query<{ id: string }>(
          `insert into sales
             (workspace_id, customer_id, location_id, number, sold_on, payment_method, note, created_by, total_amount, total_cogs, gross_profit)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           returning id`,
          [
            context.workspaceId,
            customerId,
            locationId,
            number,
            toDateString(soldOn),
            item.paymentMethod,
            item.note ?? null,
            session.userId,
            lineTotal,
            lineCogs,
            lineGrossProfit,
          ],
        )
        const saleId = sale.rows[0]!.id

        await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: prod.id,
          locationId,
          kind: 'keluar',
          direction: 'kurang',
          quantity: item.quantity,
          reasonCode: 'penjualan',
          reference: number,
          note: item.note ?? null,
          occurredOn: toDateString(soldOn),
          actorUserId: session.userId,
        })

        await tx.query(
          `insert into sale_items
             (workspace_id, sale_id, product_id, quantity, unit_price, discount_amount, line_total,
              unit_cogs, line_cogs, line_gross_profit, note)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            context.workspaceId,
            saleId,
            prod.id,
            item.quantity,
            item.unitPrice,
            item.discountAmount ?? 0,
            lineTotal,
            unitCogs,
            lineCogs,
            lineGrossProfit,
            item.note ?? null,
          ],
        )

        imported++
      }

      const body = { imported, skipped }

      await tx.query(
        `insert into idempotency_keys
           (workspace_id, operation, key, request_hash, response_status, response_body, completed_at)
         values ($1, 'sale.import', $2, $3, 201, $4, now())
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
        action: 'sale.imported',
        objectType: 'sale',
        objectId: '',
        metadata: { imported: hasil.imported, skipped: hasil.skipped },
      })
    }

    return reply.code(hasil.replayed ? 200 : 201).send(hasil)
  })
}

/* Pengeluaran -------------------------------------------------------------- */

function registerExpenseRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/expenses', async (request, reply) => {
    const context = await requireCapability(db, request, 'expenses.manage')
    const query = listExpensesQuerySchema.parse(request.query ?? {})

    const filters = ['e.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (query.categoryId) {
      params.push(query.categoryId)
      filters.push('e.category_id = $' + params.length)
    }
    if (query.dateFrom) {
      params.push(query.dateFrom)
      filters.push('e.spent_on >= $' + params.length)
    }
    if (query.dateTo) {
      params.push(query.dateTo)
      filters.push('e.spent_on <= $' + params.length)
    }

    const total = await db.query<{ total: number }>(
      `select count(*)::int as total from expenses e where ${filters.join(' and ')}`,
      params,
    )

    params.push(query.limit, query.offset)

    const expenses = await db.query<ExpenseRow>(
      `select e.id, e.category_id, ec.name as category_name, e.description, e.amount,
              e.spent_on, e.reference, e.attachment_key, e.created_at, u.name as created_by_name
         from expenses e
         join expense_categories ec on ec.id = e.category_id and ec.workspace_id = e.workspace_id
         join users u on u.id = e.created_by
        where ${filters.join(' and ')}
        order by e.spent_on desc, e.id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      expenses: expenses.rows.map(expenseRow),
      pagination: { limit: query.limit, offset: query.offset, total: total.rows[0]?.total ?? 0 },
    })
  })

  app.post('/api/workspaces/:workspaceId/expenses', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'expenses.manage')
    const input = createExpenseSchema.parse(request.body)

    const cat = await db.query(
      'select id from expense_categories where id = $1 and workspace_id = $2 and is_active',
      [input.categoryId, context.workspaceId],
    )
    if (cat.rows.length === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Kategori pengeluaran tidak ditemukan.' })
    }

    const spentOn = input.spentOn
      ? new Date(`${input.spentOn}T00:00:00.000Z`)
      : await todayInWorkspace(db, context.workspaceId)

    const created = await db.query<{ id: string }>(
      `insert into expenses (workspace_id, category_id, description, amount, spent_on, reference, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        context.workspaceId,
        input.categoryId,
        input.description,
        input.amount,
        toDateString(spentOn),
        input.reference ?? null,
        session.userId,
      ],
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'expense.created',
      objectType: 'expense',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ expenseId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/expenses/:expenseId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'expenses.manage')
    const expenseId = idFrom(paramsOf(request).expenseId)
    const input = updateExpenseSchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, expenseId]

    for (const [column, value] of Object.entries({
      category_id: input.categoryId,
      description: input.description,
      amount: input.amount,
      spent_on: input.spentOn,
      reference: input.reference,
    })) {
      if (value === undefined) continue
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'data_tidak_valid', message: 'Tidak ada yang diubah.' })
    }

    const updated = await db.query(
      `update expenses set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
      params,
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Pengeluaran tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'expense.updated',
      objectType: 'expense',
      objectId: String(expenseId),
    })

    return reply.code(200).send({ message: 'Pengeluaran sudah diperbarui.' })
  })
}

/* Metode pembayaran -------------------------------------------------------- */

function registerPaymentMethodRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/payment-methods', async (request, reply) => {
    const context = await requireCapability(db, request, 'sales.record')

    const methods = await db.query<PaymentMethodRow>(
      `select id, name, is_active, sort_order from payment_methods
       where workspace_id = $1
       order by sort_order asc, name asc`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      methods: methods.rows.map((m) => ({
        id: Number(m.id),
        name: m.name,
        isActive: m.is_active,
        sortOrder: m.sort_order,
      })),
    })
  })

  app.post('/api/workspaces/:workspaceId/payment-methods', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'products.manage') // Owner/Admin only
    const input = createPaymentMethodSchema.parse(request.body)

    const maxOrder = await db.query<{ max: number }>(
      'select coalesce(max(sort_order), 0) as max from payment_methods where workspace_id = $1',
      [context.workspaceId],
    )

    const created = await db.query<{ id: string }>(
      `insert into payment_methods (workspace_id, name, sort_order)
       values ($1, $2, $3)
       returning id`,
      [context.workspaceId, input.name, Number(maxOrder.rows[0]?.max ?? 0) + 1],
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'payment_method.created',
      objectType: 'payment_method',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ methodId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/payment-methods/:methodId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'products.manage')
    const methodId = idFrom(paramsOf(request).methodId)
    const input = updatePaymentMethodSchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, methodId]

    for (const [column, value] of Object.entries({
      name: input.name,
      is_active: input.isActive,
    })) {
      if (value === undefined) continue
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'data_tidak_valid', message: 'Tidak ada yang diubah.' })
    }

    const updated = await db.query(
      `update payment_methods set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
      params,
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Metode pembayaran tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'payment_method.updated',
      objectType: 'payment_method',
      objectId: String(methodId),
    })

    return reply.code(200).send({ message: 'Metode pembayaran sudah diperbarui.' })
  })
}

/* Kategori pengeluaran ----------------------------------------------------- */

function registerExpenseCategoryRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/workspaces/:workspaceId/expense-categories', async (request, reply) => {
    const context = await requireCapability(db, request, 'expenses.manage')

    const categories = await db.query<ExpenseCategoryRow>(
      `select id, name, is_active, sort_order from expense_categories
       where workspace_id = $1
       order by sort_order asc, name asc`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      categories: categories.rows.map((c) => ({
        id: Number(c.id),
        name: c.name,
        isActive: c.is_active,
        sortOrder: c.sort_order,
      })),
    })
  })

  app.post('/api/workspaces/:workspaceId/expense-categories', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'expenses.manage')
    const input = createExpenseCategorySchema.parse(request.body)

    const maxOrder = await db.query<{ max: number }>(
      'select coalesce(max(sort_order), 0) as max from expense_categories where workspace_id = $1',
      [context.workspaceId],
    )

    const created = await db.query<{ id: string }>(
      `insert into expense_categories (workspace_id, name, sort_order)
       values ($1, $2, $3)
       returning id`,
      [context.workspaceId, input.name, Number(maxOrder.rows[0]?.max ?? 0) + 1],
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'expense_category.created',
      objectType: 'expense_category',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ categoryId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/expense-categories/:categoryId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireCapability(db, request, 'expenses.manage')
    const categoryId = idFrom(paramsOf(request).categoryId)
    const input = updateExpenseCategorySchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, categoryId]

    for (const [column, value] of Object.entries({
      name: input.name,
      is_active: input.isActive,
    })) {
      if (value === undefined) continue
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'data_tidak_valid', message: 'Tidak ada yang diubah.' })
    }

    const updated = await db.query(
      `update expense_categories set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
      params,
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Kategori tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'expense_category.updated',
      objectType: 'expense_category',
      objectId: String(categoryId),
    })

    return reply.code(200).send({ message: 'Kategori pengeluaran sudah diperbarui.' })
  })
}

/* Helper ------------------------------------------------------------------- */

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  note: string | null
  is_archived: boolean
  created_at: Date
}

interface SaleRow {
  id: string
  number: string
  is_cancelled: boolean
  sold_on: string
  payment_method: string
  total_amount: number
  total_cogs: number
  gross_profit: number
  note: string | null
  cancelled_reason: string | null
  cancelled_at: Date | null
  created_at: Date
  customer_id: number | null
  customer_name: string | null
  location_id: number
  location_name: string
  created_by_name: string
}

interface SaleItemRow {
  id: string
  product_id: number
  product_name: string
  sku: string
  unit_code: string
  quantity: string
  unit_price: number
  discount_amount: number
  line_total: number
  unit_cogs: string
  line_cogs: number
  line_gross_profit: number
  note: string | null
}

interface ExpenseRow {
  id: string
  category_id: number
  category_name: string
  description: string
  amount: number
  spent_on: string
  reference: string | null
  attachment_key: string | null
  created_at: Date
  created_by_name: string
}

interface PaymentMethodRow {
  id: string
  name: string
  is_active: boolean
  sort_order: number
}

interface ExpenseCategoryRow {
  id: string
  name: string
  is_active: boolean
  sort_order: number
}

function customerRow(row: CustomerRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    note: row.note,
    archived: row.is_archived,
    createdAt: row.created_at,
  }
}

function saleRow(row: SaleRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    number: row.number,
    isCancelled: row.is_cancelled,
    soldOn: row.sold_on,
    paymentMethod: row.payment_method,
    totalAmount: asNumber(row.total_amount),
    totalCogs: asNumber(row.total_cogs),
    grossProfit: asNumber(row.gross_profit),
    note: row.note,
    cancelledReason: row.cancelled_reason,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    customerId: row.customer_id,
    customerName: row.customer_name,
    locationId: row.location_id,
    locationName: row.location_name,
    createdByName: row.created_by_name,
  }
}

function expenseRow(row: ExpenseRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    amount: asNumber(row.amount),
    spentOn: row.spent_on,
    reference: row.reference,
    attachmentKey: row.attachment_key,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }
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

  return { workspaceId: id, role, userId }
}

function hashBody(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}