import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database, Sql } from '@sahabat/db'
import { can, deriveStockStatus, derivedStockStatusLabels, grantFor, planCatalog, planLimitMessage } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole, requireSession } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { effectivePlan, ensureFeature, ensurePlanCapacity, lockWorkspace } from '../plans/service.ts'
import { asNumber, directionForKind, recordMovement, StockError } from './movements.ts'
import {
  createCategorySchema,
  createLocationSchema,
  createMovementSchema,
  createProductSchema,
  expiryAlertsQuerySchema,
  listBalancesQuerySchema,
  listMovementsQuerySchema,
  listProductsQuerySchema,
  recordCountItemSchema,
  startCountSchema,
  updateCategorySchema,
  updateLocationSchema,
  updateProductSchema,
} from './schemas.ts'

/**
 * Modul stok. Setiap handler punya dua lapis proteksi: peran dibaca dari
 * keanggotaan di database, dan setiap kueri menyertakan workspace_id. Menyembunyikan
 * tombol di tampilan bukan kontrol keamanan (PRD 8, PRD 9).
 */

export interface StockDeps {
  db: Database
}

interface WorkspaceContext {
  workspaceId: number
  role: 'owner' | 'admin' | 'purchasing' | 'staff' | 'viewer'
}

/** Batas halaman. Tabel besar memakai pagination, bukan memuat semuanya (PRD 14). */
const MAX_PAGE = 200

export function registerStockRoutes(app: FastifyInstance, deps: StockDeps): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/products', async (request, reply) => {
    const context = await requireRole(db, request, 'products.manage')
    const query = listProductsQuerySchema.parse(request.query ?? {})

    const filters: string[] = ['p.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (query.status) {
      params.push(query.status)
      filters.push(`p.status = $${params.length}`)
    }
    if (query.categoryId) {
      params.push(query.categoryId)
      filters.push(`p.category_id = $${params.length}`)
    }
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`)
      filters.push(`(lower(p.name) like $${params.length} or lower(p.sku) like $${params.length})`)
    }

    params.push(query.limit, query.offset)

    const total = await countMatching(db, 'products p', filters, params)

    params.push(query.limit, query.offset)

    const products = await db.query<ProductListRow>(
      `select p.id, p.sku, p.name, p.unit_code, p.status,
              p.reference_purchase_price, p.selling_price, p.min_stock, p.photo_key,
              c.id as category_id, c.name as category_name,
              coalesce(sum(b.quantity) filter (where b.quantity > 0), 0) as total_quantity,
              pc.average_cost
         from products p
         left join categories c on c.id = p.category_id and c.workspace_id = p.workspace_id
         left join stock_balances b on b.product_id = p.id and b.workspace_id = p.workspace_id
         left join product_costs pc on pc.product_id = p.id and pc.workspace_id = p.workspace_id
        where ${filters.join(' and ')}
        group by p.id, c.id, pc.average_cost
        order by p.name asc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      products: products.rows.map(productRow),
      pagination: { limit: query.limit, offset: query.offset, total },
    })
  })

  app.post('/api/workspaces/:workspaceId/products', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'products.manage')
    const input = createProductSchema.parse(request.body)

    const product = await db.transaction(async (tx) => {
      await ensurePlanCapacity(tx, context.workspaceId, 'produk')
      await tx.query(
        `insert into products
           (workspace_id, category_id, sku, name, unit_code,
            reference_purchase_price, selling_price, min_stock, photo_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          context.workspaceId,
          input.categoryId ?? null,
          input.sku,
          input.name,
          input.unitCode,
          input.referencePurchasePrice,
          input.sellingPrice,
          input.minStock,
          input.photoKey ?? null,
        ],
      ).catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new StockError(
            'sku_sudah_dipakai',
            `SKU ${input.sku} sudah dipakai produk lain di workspace ini.`,
          )
        }
        if (isForeignKeyViolation(error)) {
          throw new StockError('kategori_tidak_ditemukan', 'Kategori itu tidak ada.', 404)
        }
        throw error
      })

      const created = await tx.query<{ id: number }>(
        'select id from products where workspace_id = $1 and lower(sku) = lower($2)',
        [context.workspaceId, input.sku],
      )

      await tx.query(
        'insert into product_costs (workspace_id, product_id) values ($1, $2)',
        [context.workspaceId, created.rows[0]!.id],
      )

      return created.rows[0]!.id
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'product.created',
      objectType: 'product',
      objectId: String(product),
    })

    return reply.code(201).send({ productId: product })
  })

  app.get('/api/workspaces/:workspaceId/products/:productId', async (request, reply) => {
    const context = await requireRole(db, request, 'products.manage')
    const productId = idFrom(paramsOf(request).productId)

    const found = await db.query<ProductListRow>(
      `select p.id, p.sku, p.name, p.unit_code, p.status,
              p.reference_purchase_price, p.selling_price, p.min_stock, p.photo_key,
              c.id as category_id, c.name as category_name,
              coalesce(sum(b.quantity) filter (where b.quantity > 0), 0) as total_quantity,
              pc.average_cost
         from products p
         left join categories c on c.id = p.category_id and c.workspace_id = p.workspace_id
         left join stock_balances b on b.product_id = p.id and b.workspace_id = p.workspace_id
         left join product_costs pc on pc.product_id = p.id and pc.workspace_id = p.workspace_id
        where p.workspace_id = $1 and p.id = $2
        group by p.id, c.id, pc.average_cost`,
      [context.workspaceId, productId],
    )

    const row = found.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Produk tidak ditemukan.' })
    }

    const balances = await db.query<BalanceListRow>(
      `select b.location_id, l.name as location_name, b.quantity,
              (select to_char(min(sl.expires_at), 'YYYY-MM-DD')
                 from stock_lots sl
                where sl.product_id = b.product_id
                  and sl.location_id = b.location_id
                  and sl.workspace_id = b.workspace_id
                  and sl.quantity_remaining > 0
                  and sl.expires_at is not null) as earliest_expiry
         from stock_balances b
         join locations l on l.id = b.location_id and l.workspace_id = b.workspace_id
        where b.workspace_id = $1 and b.product_id = $2
        order by l.name asc`,
      [context.workspaceId, productId],
    )

    return reply.code(200).send({
      product: productRow(row),
      balances: balances.rows.map((balance) => ({
        locationId: balance.location_id,
        locationName: balance.location_name,
        quantity: asNumber(balance.quantity),
        earliestExpiry: balance.earliest_expiry,
      })),
    })
  })

  app.patch('/api/workspaces/:workspaceId/products/:productId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'products.manage')
    const productId = idFrom(paramsOf(request).productId)
    const input = updateProductSchema.parse(request.body)

    const columns: Record<string, unknown> = {
      sku: input.sku,
      name: input.name,
      unit_code: input.unitCode,
      reference_purchase_price: input.referencePurchasePrice,
      selling_price: input.sellingPrice,
      min_stock: input.minStock,
      status: input.status,
    }

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, productId]

    for (const [column, value] of Object.entries(columns)) {
      if (value === undefined) {
        continue
      }
      if (column === 'category_id') {
        continue
      }
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }

    if (input.categoryId !== undefined) {
      params.push(input.categoryId)
      sets.push(`category_id = $${params.length}`)
    }

    const updated = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      if (input.status === 'aktif') {
        const current = await tx.query<{ status: string }>(
          'select status from products where workspace_id = $1 and id = $2',
          [context.workspaceId, productId],
        )
        if (current.rows[0]?.status !== 'aktif') {
          const plan = await effectivePlan(tx, context.workspaceId)
          const cap = planCatalog[plan].activeProducts
          const active = await tx.query<{ count: string }>(
            `select count(*)::text as count from products where workspace_id = $1 and status = 'aktif'`,
            [context.workspaceId],
          )
          if (Number(active.rows[0]?.count ?? 0) + 1 > cap) {
            throw new StockError('batas_paket', planLimitMessage('produk', cap), 409, {
              resource: 'produk', limit: cap, used: Number(active.rows[0]?.count ?? 0), requested: 1, plan,
            })
          }
        }
      }
      return tx.query(
        `update products set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
        params,
      )
    })

    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Produk tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'product.updated',
      objectType: 'product',
      objectId: String(productId),
    })

    return reply.code(200).send({ message: 'Produk sudah diperbarui.' })
  })

  app.get('/api/workspaces/:workspaceId/categories', async (request, reply) => {
    const context = await requireRole(db, request, 'products.manage')

    const categories = await db.query<{ id: string; name: string; product_count: string }>(
      `select c.id, c.name, count(p.id)::int as product_count
         from categories c
         left join products p on p.category_id = c.id and p.workspace_id = c.workspace_id
        where c.workspace_id = $1
        group by c.id
        order by c.name asc`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      categories: categories.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        productCount: asNumber(row.product_count),
      })),
    })
  })

  app.post('/api/workspaces/:workspaceId/categories', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'products.manage')
    const input = createCategorySchema.parse(request.body)

    const created = await db.query<{ id: string }>(
      'insert into categories (workspace_id, name) values ($1, $2) returning id',
      [context.workspaceId, input.name],
    ).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new StockError(
          'kategori_sudah_ada',
          `Kategori ${input.name} sudah ada di workspace ini.`,
        )
      }
      throw error
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'category.created',
      objectType: 'category',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ categoryId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/categories/:categoryId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'products.manage')
    const categoryId = idFrom(paramsOf(request).categoryId)
    const input = updateCategorySchema.parse(request.body)

    const updated = await db.query(
      'update categories set name = $3 where workspace_id = $1 and id = $2',
      [context.workspaceId, categoryId, input.name],
    )
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Kategori tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'category.updated',
      objectType: 'category',
      objectId: String(categoryId),
    })

    return reply.code(200).send({ message: 'Kategori sudah diperbarui.' })
  })

  app.get('/api/workspaces/:workspaceId/locations', async (request, reply) => {
    const context = await requireRole(db, request, 'products.manage')

    const locations = await db.query<{
      id: string
      name: string
      code: string | null
      is_archived: boolean
      is_default: boolean
    }>(
      `select l.id, l.name, l.code, l.is_archived, (w.default_location_id = l.id) as is_default
         from locations l
         join workspaces w on w.id = l.workspace_id
        where l.workspace_id = $1
        order by l.is_archived asc, l.name asc`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      locations: locations.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        code: row.code,
        archived: row.is_archived,
        isDefault: row.is_default,
      })),
    })
  })

  app.post('/api/workspaces/:workspaceId/locations', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'locations.manage')
    const input = createLocationSchema.parse(request.body)

    const created = await db.transaction(async (tx) => {
      await ensurePlanCapacity(tx, context.workspaceId, 'lokasi')
      return tx.query<{ id: string }>(
        'insert into locations (workspace_id, name, code) values ($1, $2, $3) returning id',
        [context.workspaceId, input.name, input.code ?? null],
      )
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new StockError(
          'lokasi_sudah_ada',
          `Lokasi ${input.name} sudah ada di workspace ini.`,
        )
      }
      throw error
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'location.created',
      objectType: 'location',
      objectId: created.rows[0]!.id,
    })

    return reply.code(201).send({ locationId: Number(created.rows[0]!.id) })
  })

  app.patch('/api/workspaces/:workspaceId/locations/:locationId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'locations.manage')
    const locationId = idFrom(paramsOf(request).locationId)
    const input = updateLocationSchema.parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [context.workspaceId, locationId]

    for (const [column, value] of Object.entries({
      name: input.name,
      code: input.code,
      is_archived: input.isArchived,
    })) {
      if (value === undefined) {
        continue
      }
      params.push(value)
      sets.push(`${column} = $${params.length}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'data_tidak_valid', message: 'Tidak ada yang diubah.' })
    }

    const updated = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      if (input.isArchived === false) {
        const current = await tx.query<{ is_archived: boolean }>(
          'select is_archived from locations where workspace_id = $1 and id = $2',
          [context.workspaceId, locationId],
        )
        if (current.rows[0]?.is_archived) {
          const plan = await effectivePlan(tx, context.workspaceId)
          const limit = planCatalog[plan].locations
          const count = await tx.query<{ count: string }>(
            'select count(*)::text as count from locations where workspace_id = $1 and not is_archived',
            [context.workspaceId],
          )
          const used = Number(count.rows[0]?.count ?? 0)
          if (used + 1 > limit) {
            throw new StockError('batas_paket', planLimitMessage('lokasi', limit), 409, {
              resource: 'lokasi', limit, used, requested: 1, plan,
            })
          }
        }
      }
      return tx.query(
        `update locations set ${sets.join(', ')} where workspace_id = $1 and id = $2`,
        params,
      )
    })
    if (updated.affected === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Lokasi tidak ditemukan.' })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'location.updated',
      objectType: 'location',
      objectId: String(locationId),
    })

    return reply.code(200).send({ message: 'Lokasi sudah diperbarui.' })
  })

  app.get('/api/workspaces/:workspaceId/stock/movements', async (request, reply) => {
    const context = await requireRole(db, request, 'reports.stock')
    const query = listMovementsQuerySchema.parse(request.query ?? {})

    const filters = ['m.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    for (const [column, value] of [
      ['product_id', query.productId],
      ['location_id', query.locationId],
      ['kind', query.kind],
    ] as const) {
      if (value !== undefined) {
        params.push(value)
        filters.push(`m.${column} = $${params.length}`)
      }
    }

    if (query.from) {
      params.push(query.from)
      filters.push(`m.occurred_on >= $${params.length}`)
    }
    if (query.to) {
      params.push(query.to)
      filters.push(`m.occurred_on <= $${params.length}`)
    }

    const total = await countMatching(db, 'stock_movements m', filters, params)

    params.push(query.limit, query.offset)

    const movements = await db.query<MovementListRow>(
      `select m.id, m.kind, m.quantity, m.unit_cost, m.balance_before, m.balance_after,
              m.reason_code, m.reference, m.note,
              to_char(m.occurred_on, 'YYYY-MM-DD') as occurred_on, m.created_at,
              p.id as product_id, p.name as product_name, p.unit_code,
              l.id as location_id, l.name as location_name,
              u.name as actor_name
         from stock_movements m
         join products p on p.id = m.product_id and p.workspace_id = m.workspace_id
         join locations l on l.id = m.location_id and l.workspace_id = m.workspace_id
         left join users u on u.id = m.actor_user_id
        where ${filters.join(' and ')}
        order by m.occurred_on desc, m.id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    )

    return reply.code(200).send({
      movements: movements.rows.map(movementRow),
      pagination: { limit: query.limit, offset: query.offset, total },
    })
  })

  app.post('/api/workspaces/:workspaceId/stock/movements', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'stock.movements')
    const input = createMovementSchema.parse(request.body)

    // Penyesuaian mengubah catatan tanpa ada barang nyata yang bergerak, jadi
    // Owner dan Admin saja. Staf tetap boleh mencatat barang masuk dan keluar.
    const isAdjustment =
      input.kind === 'penyesuaian_naik' || input.kind === 'penyesuaian_turun'
    if (isAdjustment && grantFor(context.role, 'stock.adjustments') !== 'manage') {
      throw new AuthorizationError('Penyesuaian stok hanya bisa dibuat Owner dan Admin.')
    }

    const occurredOn: string = input.occurredOn ?? (await todayInWorkspace(db, context.workspaceId))

    const result = await db.transaction(async (tx) =>
      recordMovement(tx, {
        workspaceId: context.workspaceId,
        productId: input.productId,
        locationId: input.locationId,
        kind: input.kind as Parameters<typeof directionForKind>[0],
        direction: directionForKind(input.kind as Parameters<typeof directionForKind>[0]),
        quantity: input.quantity,
        unitCost: input.unitCost,
        expiresAt: input.expiresAt,
        reasonCode: input.reasonCode,
        reference: input.reference ?? null,
        note: input.note ?? null,
        occurredOn,
        actorUserId: session.userId,
        idempotencyKey: input.idempotencyKey ?? null,
      }),
    )

    if (!result.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: session.userId,
        actorRole: context.role,
        action: `stock.${input.kind}`,
        objectType: 'stock_movement',
        objectId: String(result.movementId),
        metadata: {
          productId: input.productId,
          locationId: input.locationId,
          quantity: input.quantity,
          balanceAfter: result.balanceAfter,
        },
      })
    }

    return reply.code(result.replayed ? 200 : 201).send({
      movementId: result.movementId,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      averageCost: result.averageCost,
      inventoryValue: result.inventoryValue,
      replayed: result.replayed,
    })
  })

  app.get('/api/workspaces/:workspaceId/stock/balances', async (request, reply) => {
    const context = await requireRole(db, request, 'reports.stock')
    const query = listBalancesQuerySchema.parse(request.query ?? {})

    const filters = ['b.workspace_id = $1']
    const params: unknown[] = [context.workspaceId]

    if (query.locationId) {
      params.push(query.locationId)
      filters.push(`b.location_id = $${params.length}`)
    }
    if (query.onlyProblem) {
      filters.push('(b.quantity = 0 or (p.min_stock is not null and b.quantity <= p.min_stock))')
    }

    const balances = await db.query<BalanceListRow>(
      `select p.id as product_id, p.name as product_name, p.sku, p.unit_code, p.min_stock,
              b.location_id, l.name as location_name, b.quantity,
              (select to_char(min(sl.expires_at), 'YYYY-MM-DD')
                 from stock_lots sl
                where sl.product_id = b.product_id
                  and sl.location_id = b.location_id
                  and sl.workspace_id = b.workspace_id
                  and sl.quantity_remaining > 0
                  and sl.expires_at is not null) as earliest_expiry
         from stock_balances b
         join products p on p.id = b.product_id and p.workspace_id = b.workspace_id
         join locations l on l.id = b.location_id and l.workspace_id = b.workspace_id
        where ${filters.join(' and ')}
        order by p.name asc, l.name asc
        limit ${MAX_PAGE}`,
      params,
    )

    return reply.code(200).send({
      balances: balances.rows.map((row) => {
        const quantity = asNumber(row.quantity)
        const minStock = row.min_stock === null ? null : asNumber(row.min_stock)
        const status = deriveStockStatus(quantity, minStock)
        return {
          productId: row.product_id,
          productName: row.product_name,
          sku: row.sku,
          unitCode: row.unit_code,
          locationId: row.location_id,
          locationName: row.location_name,
          quantity,
          minStock,
          status,
          statusLabel: derivedStockStatusLabels[status],
          earliestExpiry: row.earliest_expiry,
        }
      }),
    })
  })

  /**
   * PRD 6.2: peringatan stok rendah dan hampir kedaluwarsa memakai batas yang
   * diatur per produk. Daftar ini menggabungkan keduanya dan mengurutkan yang paling
   * mendesak lebih dulu, supaya pemilik bisa langsung tahu apa yang harus dibeli.
   */
  app.get('/api/workspaces/:workspaceId/stock/alerts', async (request, reply) => {
    const context = await requireRole(db, request, 'reports.stock')
    const query = expiryAlertsQuerySchema.parse(request.query ?? {})

    const filters = ['b.workspace_id = $1', 'p.status <> $2']
    const params: unknown[] = [context.workspaceId, 'diarsipkan']

    if (query.locationId) {
      params.push(query.locationId)
      filters.push(`b.location_id = $${params.length}`)
    }

    params.push(query.withinDays)

    const rows = await db.query<AlertRow>(
      `select p.id as product_id, p.name as product_name, p.sku, p.unit_code, p.min_stock,
              b.location_id, l.name as location_name, b.quantity,
              to_char(
                (select min(sl.expires_at)
                   from stock_lots sl
                  where sl.product_id = b.product_id
                    and sl.location_id = b.location_id
                    and sl.workspace_id = b.workspace_id
                    and sl.quantity_remaining > 0
                    and sl.expires_at is not null),
                'YYYY-MM-DD'
              ) as earliest_expiry
         from stock_balances b
         join products p on p.id = b.product_id and p.workspace_id = b.workspace_id
         join locations l on l.id = b.location_id and l.workspace_id = b.workspace_id
        where ${filters.join(' and ')}
          and (
            b.quantity = 0
            or (p.min_stock is not null and b.quantity <= p.min_stock)
            or (select min(sl.expires_at)
                  from stock_lots sl
                 where sl.product_id = b.product_id
                   and sl.location_id = b.location_id
                   and sl.workspace_id = b.workspace_id
                   and sl.quantity_remaining > 0
                   and sl.expires_at is not null)
                <= (current_date + make_interval(days => $${params.length}))
          )
        order by earliest_expiry asc nulls last, p.name asc
        limit ${MAX_PAGE}`,
      params,
    )

    return reply.code(200).send({
      withinDays: query.withinDays,
      alerts: rows.rows.map((row) => {
        const quantity = asNumber(row.quantity)
        const minStock = row.min_stock === null ? null : asNumber(row.min_stock)
        const status = deriveStockStatus(quantity, minStock)

        const reasons: string[] = []
        if (status === 'habis') reasons.push('stok_habis')
        if (status === 'stok_rendah') reasons.push('stok_rendah')
        if (row.earliest_expiry !== null) reasons.push('hampir_kedaluwarsa')

        return {
          productId: row.product_id,
          productName: row.product_name,
          sku: row.sku,
          unitCode: row.unit_code,
          locationId: row.location_id,
          locationName: row.location_name,
          quantity,
          minStock,
          status,
          statusLabel: derivedStockStatusLabels[status],
          earliestExpiry: row.earliest_expiry,
          reasons,
        }
      }),
    })
  })

  registerCountRoutes(app, deps)
}

/**
 * Stok opname. Satu sesi untuk satu lokasi, bisa dilanjutkan di hari berikutnya,
 * dan selisihnya baru menjadi transaksi penyesuaian setelah ada persetujuan
 * (PRD 6.2).
 */
function registerCountRoutes(app: FastifyInstance, deps: StockDeps): void {
  const { db } = deps

  app.post('/api/workspaces/:workspaceId/stock/counts', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'stock.opname')
    const input = startCountSchema.parse(request.body)

    const result = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'stocktake')
      const open = await tx.query<{ id: string }>(
        `select id from stock_counts where workspace_id = $1 and location_id = $2 and status = 'draf'`,
        [context.workspaceId, input.locationId],
      )
      const resumed = open.rows[0]
      if (resumed) return { countId: Number(resumed.id), resumed: true }

      const location = await tx.query(
        'select 1 from locations where id = $1 and workspace_id = $2 and not is_archived',
        [input.locationId, context.workspaceId],
      )
      if (location.rows.length === 0) {
        throw new StockError('lokasi_tidak_ditemukan', 'Lokasi tidak ditemukan.', 404)
      }

      const count = await tx.query<{ id: string }>(
        `insert into stock_counts (workspace_id, location_id, note, started_by)
         values ($1, $2, $3, $4)
         returning id`,
        [context.workspaceId, input.locationId, input.note ?? null, session.userId],
      )
      const countId = count.rows[0]!.id

      // Daftar produk diambil saat sesi dibuka, bukan saat setiap baris diisi, jadi
      // petugas menghitung satu daftar yang sama sampai selesai.
      const items = await tx.query<{ id: number }>(
        `select id from products where workspace_id = $1 and status <> 'diarsipkan' order by name asc`,
        [context.workspaceId],
      )
      for (const item of items.rows) {
        const balance = await tx.query<{ quantity: string }>(
          'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
          [context.workspaceId, item.id, input.locationId],
        )
        await tx.query(
          `insert into stock_count_items (workspace_id, count_id, product_id, system_quantity)
           values ($1, $2, $3, $4)`,
          [context.workspaceId, countId, item.id, asNumber(balance.rows[0]?.quantity)],
        )
      }

      return { countId: Number(countId), resumed: false }
    })

    return reply.code(result.resumed ? 200 : 201).send(result)
  })

  app.get('/api/workspaces/:workspaceId/stock/counts', async (request, reply) => {
    const context = await requireRole(db, request, 'stock.opname')

    const counts = await db.query<{
      id: string
      location_id: number
      location_name: string
      status: string
      started_at: Date
      note: string | null
      counted_items: string
      total_items: string
    }>(
      `select c.id, c.location_id, l.name as location_name, c.status, c.started_at, c.note,
              count(i.id) filter (where i.counted_at is not null)::text as counted_items,
              count(i.id)::text as total_items
         from stock_counts c
         join locations l on l.id = c.location_id and l.workspace_id = c.workspace_id
         left join stock_count_items i on i.count_id = c.id
        where c.workspace_id = $1
        group by c.id, l.name
        order by c.started_at desc
        limit ${MAX_PAGE}`,
      [context.workspaceId],
    )

    return reply.code(200).send({
      counts: counts.rows.map((row) => ({
        countId: Number(row.id),
        locationId: row.location_id,
        locationName: row.location_name,
        status: row.status,
        startedAt: row.started_at,
        note: row.note,
        countedItems: asNumber(row.counted_items),
        totalItems: asNumber(row.total_items),
      })),
    })
  })

  app.get('/api/workspaces/:workspaceId/stock/counts/:countId', async (request, reply) => {
    const context = await requireRole(db, request, 'stock.opname')
    const countId = idFrom(paramsOf(request).countId)

    const count = await db.query<{
      id: string
      location_id: number
      location_name: string
      status: string
      note: string | null
    }>(
      `select c.id, c.location_id, l.name as location_name, c.status, c.note
         from stock_counts c
         join locations l on l.id = c.location_id and l.workspace_id = c.workspace_id
        where c.workspace_id = $1 and c.id = $2`,
      [context.workspaceId, countId],
    )
    const row = count.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Sesi opname tidak ditemukan.' })
    }

    const items = await db.query<{
      id: string
      product_id: number
      product_name: string
      sku: string
      unit_code: string
      system_quantity: string
      counted_quantity: string
      counted_at: Date | null
    }>(
      `select i.id, i.product_id, p.name as product_name, p.sku, p.unit_code,
              i.system_quantity, i.counted_quantity, i.counted_at
         from stock_count_items i
         join products p on p.id = i.product_id and p.workspace_id = i.workspace_id
        where i.workspace_id = $1 and i.count_id = $2
        order by p.name asc`,
      [context.workspaceId, countId],
    )

    return reply.code(200).send({
      count: {
        countId: Number(row.id),
        locationId: row.location_id,
        locationName: row.location_name,
        status: row.status,
        note: row.note,
      },
      items: items.rows.map((item) => {
        const system = asNumber(item.system_quantity)
        const counted = asNumber(item.counted_quantity)
        return {
          itemId: Number(item.id),
          productId: item.product_id,
          productName: item.product_name,
          sku: item.sku,
          unitCode: item.unit_code,
          systemQuantity: system,
          countedQuantity: counted,
          variance: item.counted_at === null ? null : counted - system,
          counted: item.counted_at !== null,
        }
      }),
    })
  })

  app.put('/api/workspaces/:workspaceId/stock/counts/:countId/items/:productId', async (request, reply) => {
    const session = requireSession(request)
    const context = await requireRole(db, request, 'stock.opname')
    const countId = idFrom(paramsOf(request).countId)
    const productId = idFrom(paramsOf(request).productId)
    const input = recordCountItemSchema.parse(request.body)

    const updated = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'stocktake')
      return tx.query(
      `update stock_count_items i
          set counted_quantity = $3, counted_at = now(), counted_by = $4
         from stock_counts c
        where i.count_id = $1
          and i.product_id = $2
          and i.workspace_id = $5
          and c.id = i.count_id
          and c.status = 'draf'
          and c.workspace_id = $5`,
      [countId, productId, input.countedQuantity, session.userId, context.workspaceId],
      )
    })

    if (updated.affected === 0) {
      return reply.code(409).send({
        error: 'sesi_tidak_draf',
        message: 'Sesi opname ini sudah tidak bisa diisi.',
      })
    }

    return reply.code(200).send({ message: 'Jumlah fisik tersimpan.' })
  })

  app.post('/api/workspaces/:workspaceId/stock/counts/:countId/approve', async (request, reply) => {
    const session = requireSession(request)
    // Hasil persetujuan adalah transaksi penyesuaian, jadi izinnya sama dengan
    // izin membuat penyesuaian: staf boleh menghitung, tidak boleh menyetujui.
    const context = await requireRole(db, request, 'stock.adjustments')
    const countId = idFrom(paramsOf(request).countId)

    const result = await db.transaction(async (tx) => {
      await ensureFeature(tx, context.workspaceId, 'stocktake')
      const count = await tx.query<{
        id: string
        workspace_id: string
        location_id: number
        status: string
      }>(
        `select id, workspace_id, location_id, status from stock_counts
          where id = $1 and workspace_id = $2
          for update`,
        [countId, context.workspaceId],
      )
      const row = count.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'Sesi opname tidak ditemukan.', 404)
      }
      if (row.status !== 'draf' && row.status !== 'selesai') {
        throw new StockError(
          'sesi_sudah_disetujui',
          'Selisih opname ini sudah menjadi transaksi penyesuaian.',
        )
      }

      const items = await tx.query<{ product_id: number; system_quantity: string; counted_quantity: string; counted_at: Date | null }>(
        `select product_id, system_quantity, counted_quantity, counted_at
           from stock_count_items
          where count_id = $1 and workspace_id = $2
          order by product_id asc`,
        [countId, context.workspaceId],
      )

      const today = await tx.query<{ today: string }>(
        `select to_char(now() at time zone (select timezone from workspaces where id = $1), 'YYYY-MM-DD') as today`,
        [context.workspaceId],
      )
      const occurredOn = today.rows[0]!.today

      let adjustments = 0

      for (const item of items.rows) {
        if (item.counted_at === null) {
          continue
        }

        // Selisih dihitung ulang terhadap saldo saat ini, bukan terhadap angka
        // sistem yang dicatat saat sesi dibuka. Kalau ada transaksi di tengah
        // hitungan, angkanya tetap bisa dijelaskan.
        const balance = await tx.query<{ quantity: string }>(
          `select quantity from stock_balances
            where workspace_id = $1 and product_id = $2 and location_id = $3
            for update`,
          [context.workspaceId, item.product_id, row.location_id],
        )
        const current = asNumber(balance.rows[0]?.quantity)
        const difference = asNumber(item.counted_quantity) - current

        if (difference === 0) {
          continue
        }

        await recordMovement(tx, {
          workspaceId: context.workspaceId,
          productId: item.product_id,
          locationId: row.location_id,
          kind: 'opname_selisih',
          direction: directionForKind('opname_selisih', difference),
          quantity: Math.abs(difference),
          unitCost: null,
          reasonCode: 'opname',
          reference: `OPNAME-${countId}`,
          note: 'Selisih stok opname',
          occurredOn,
          actorUserId: session.userId,
        })
        adjustments += 1
      }

      await tx.query(
        `update stock_counts set status = 'disetujui', approved_by = $2, approved_at = now()
          where id = $1 and workspace_id = $3`,
        [countId, session.userId, context.workspaceId],
      )

      return adjustments
    })

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: session.userId,
      actorRole: context.role,
      action: 'stock_count.approved',
      objectType: 'stock_count',
      objectId: String(countId),
      metadata: { adjustments: result },
    })

    return reply.code(200).send({
      adjustments: result,
      message:
        result === 0
          ? 'Tidak ada selisih, jadi tidak ada transaksi penyesuaian yang dibuat.'
          : `${result} penyesuaian stok sudah dicatat dari hasil opname.`,
    })
  })
}

interface ProductListRow {
  id: string
  sku: string
  name: string
  unit_code: string
  status: string
  reference_purchase_price: string | null
  selling_price: string | null
  min_stock: string | null
  photo_key: string | null
  category_id: string | null
  category_name: string | null
  total_quantity: string
  average_cost: string | null
}

interface MovementListRow {
  id: string
  kind: string
  quantity: string
  unit_cost: string | null
  balance_before: string
  balance_after: string
  reason_code: string
  reference: string | null
  note: string | null
  occurred_on: string
  created_at: Date
  product_id: number
  product_name: string
  unit_code: string
  location_id: number
  location_name: string
  actor_name: string | null
}

interface BalanceListRow {
  product_id: number
  product_name: string
  sku: string
  unit_code: string
  min_stock: string | null
  location_id: number
  location_name: string
  quantity: string
  earliest_expiry: string | null
}

type AlertRow = BalanceListRow
function productRow(row: ProductListRow): Record<string, unknown> {
  const quantity = asNumber(row.total_quantity)
  const minStock = row.min_stock === null ? null : asNumber(row.min_stock)
  const status = deriveStockStatus(quantity, minStock)

  return {
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    unitCode: row.unit_code,
    status: row.status,
    categoryId: row.category_id === null ? null : Number(row.category_id),
    categoryName: row.category_name,
    referencePurchasePrice: row.reference_purchase_price === null ? null : asNumber(row.reference_purchase_price),
    sellingPrice: row.selling_price === null ? null : asNumber(row.selling_price),
    averageCost: row.average_cost === null ? 0 : asNumber(row.average_cost),
    minStock,
    totalQuantity: quantity,
    stockStatus: status,
    stockStatusLabel: derivedStockStatusLabels[status],
    photoKey: row.photo_key,
  }
}

function movementRow(row: MovementListRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    kind: row.kind,
    kindLabel: movementKindLabels[row.kind] ?? row.kind,
    quantity: asNumber(row.quantity),
    unitCost: row.unit_cost === null ? null : asNumber(row.unit_cost),
    balanceBefore: asNumber(row.balance_before),
    balanceAfter: asNumber(row.balance_after),
    reasonCode: row.reason_code,
    reference: row.reference,
    note: row.note,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
    productId: row.product_id,
    productName: row.product_name,
    unitCode: row.unit_code,
    locationId: row.location_id,
    locationName: row.location_name,
    actorName: row.actor_name,
  }
}

export const movementKindLabels: Record<string, string> = {
  masuk: 'Stok masuk',
  keluar: 'Stok keluar',
  penyesuaian_naik: 'Penyesuaian naik',
  penyesuaian_turun: 'Penyesuaian turun',
  opname_selisih: 'Selisih opname',
}

/**
 * Jumlah baris yang cocok dengan filter, dihitung terpisah supaya angka total
 * tidak bergantung pada baris yang kebetulan terpotong halaman ini (PRD 14).
 */
async function countMatching(
  db: Sql,
  from: string,
  filters: string[],
  params: unknown[],
): Promise<number> {
  const result = await db.query<{ total: string }>(
    `select count(*)::int as total from ${from} where ${filters.join(' and ')}`,
    params,
  )
  return asNumber(result.rows[0]?.total)
}

/** Tanggal kalender hari ini menurut zona waktu workspace (B-10). */
async function todayInWorkspace(db: Sql, workspaceId: number): Promise<string> {
  const result = await db.query<{ today: string }>(
    `select to_char(now() at time zone (select timezone from workspaces where id = $1), 'YYYY-MM-DD') as today`,
    [workspaceId],
  )
  return result.rows[0]?.today ?? new Date().toISOString().slice(0, 10)
}

async function requireRole(
  db: Database,
  request: FastifyRequest,
  capability: Parameters<typeof can>[1],
  grant?: Parameters<typeof can>[2],
): Promise<WorkspaceContext> {
  const { workspaceId, role } = await loadWorkspaceRole(db, request, idFrom(paramsOf(request).workspaceId))
  if (!can(role, capability, grant)) {
    throw new AuthorizationError('Anda tidak punya izin untuk tindakan ini.')
  }
  return { workspaceId, role }
}

/** Parameter rute dibaca sebagai teks, lalu divalidasi sebagai angka positif. */
function paramsOf(request: FastifyRequest): Record<string, string> {
  return (request.params ?? {}) as Record<string, string>
}

/**
 * Pelanggaran batasan unik dari PostgreSQL. Pesan aslinya berbahasa Inggris dan
 * menyebut nama constraint, jadi tidak pernah diteruskan ke pengguna; setiap
 * pemanggil memetakannya ke kalimat yang menyebut objeknya (PRD 9).
 */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23503'
}

function idFrom(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new StockError('data_tidak_valid', 'Alamat tidak valid.', 400)
  }
  return value
}
