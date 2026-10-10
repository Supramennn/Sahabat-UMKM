import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { z } from 'zod'
import { writeAudit } from '../auth/audit.ts'
import { StockError, asNumber } from '../stock/movements.ts'
import { renderPurchaseOrderPdf, type PdfOrder, type PdfOrderItem } from './pdf.ts'
import { idFrom, orderStatusLabels, paramsOf, requireCapability } from './routes.ts'

/**
 * Pembagian purchase order (PRD 6.3 dan A-11).
 *
 * PRD 6.3: PO dapat diunduh sebagai PDF dan dikirim lewat email atau dibagikan
 * sebagai tautan baca-saja. A-11 memperinci tautannya: token acak, kedaluwarsa
 * 30 hari secara bawaan dan bisa diubah Owner, bisa dicabut kapan saja, halamannya
 * tidak boleh diindeks mesin pencari, dan setiap pembukaan masuk audit log dengan
 * alamat IP dan waktunya.
 *
 * Tiga aturan yang dipegang di sini:
 *
 * 1. Yang disimpan hanya hash token. Isi tabel yang bocor tidak cukup untuk
 *    membuka tautan mana pun (PRD 9).
 * 2. Halaman publik tidak memakai sesi sama sekali. Ia hanya membaca lewat token,
 *    jadi tidak ada jalan dari sana ke data workspace lain.
 * 3. Setiap pembukaan menambah penghitung dan mencatat alamat IP, sehingga pemilik
 *    tahu tautannya sudah dipakai tanpa perlu menebak.
 */

const SHARE_TOKEN_BYTES = 32

/** 30 hari sesuai A-11. Nilai ini dipakai kalau pengaturan workspace belum ada. */
export const DEFAULT_SHARE_TTL_DAYS = 30

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const shareSchema = z.object({
  /** Owner boleh menetapkan masa berlaku sendiri; batasnya 1 sampai 365 hari. */
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  label: z.string().trim().max(80).nullable().optional(),
  /** Kalau diisi, tautannya langsung dikirim ke alamat ini. */
  sendTo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: 'Format email tidak valid.',
    })
    .optional(),
})

export interface ShareDeps {
  db: Database
  webOrigin: string
  sendEmail: (message: { to: string; subject: string; body: string }) => Promise<void>
}

interface OrderHeaderRow {
  number: string
  status: string
  ordered_on: string
  expected_on: string | null
  total_amount: number
  note: string | null
  supplier_name: string
  supplier_contact_name: string | null
  supplier_phone: string | null
  supplier_email: string | null
  supplier_address: string | null
  location_name: string
  workspace_name: string
  created_by_name: string
  approved_at: string | null
}

interface OrderItemRow {
  product_name: string
  sku: string
  unit_code: string
  quantity: string
  unit_price: number
  discount_amount: number
  line_total: number
}

const ORDER_ITEMS_QUERY = `
  select p.name as product_name, p.sku, p.unit_code,
         i.quantity, i.unit_price, i.discount_amount, i.line_total
    from purchase_order_items i
    join products p on p.id = i.product_id and p.workspace_id = i.workspace_id
   where i.workspace_id = $1 and i.purchase_order_id = $2
   order by p.name asc`

function toItem(row: OrderItemRow): PdfOrderItem {
  return {
    productName: row.product_name,
    sku: row.sku,
    unitCode: row.unit_code,
    quantity: asNumber(row.quantity),
    unitPrice: asNumber(row.unit_price),
    discountAmount: asNumber(row.discount_amount),
    lineTotal: asNumber(row.line_total),
  }
}

export function registerPurchaseOrderShareRoutes(app: FastifyInstance, deps: ShareDeps): void {
  const { db, webOrigin, sendEmail } = deps

  /** Kondisi tautan yang terakhir dibuat, supaya UI bisa menampilkannya. */
  app.get('/api/workspaces/:workspaceId/purchase-orders/:orderId/share', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)

    // Panjang baris, bukan affected: penghitung baris tidak selalu terisi untuk
    // kueri SELECT, jadi PO yang ada bisa terlihat tidak ada.
    const order = await db.query<{ id: number }>(
      'select id from purchase_orders where id = $1 and workspace_id = $2',
      [orderId, context.workspaceId],
    )
    if (order.rows.length === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'PO tidak ditemukan.' })
    }

    return reply.code(200).send({ share: await shareStatus(db, context.workspaceId, orderId) })
  })

  /**
   * Membuat tautan baca-saja. Tautan yang lama dicabut lebih dulu, jadi selalu ada
   * tepat satu alamat yang hidup untuk setiap PO.
   */
  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/share', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)
    const input = shareSchema.parse(request.body ?? {})

    const dibuat = await db.transaction(async (tx) => {
      const order = await tx.query<{ number: string; supplier_name: string }>(
        `select o.number, s.name as supplier_name
           from purchase_orders o
           join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
          where o.id = $1 and o.workspace_id = $2`,
        [orderId, context.workspaceId],
      )
      const row = order.rows[0]
      if (!row) {
        throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
      }

      const pengaturan = await tx.query<{ po_share_ttl_days: number }>(
        'select po_share_ttl_days from workspace_settings where workspace_id = $1',
        [context.workspaceId],
      )
      const hari = input.expiresInDays ?? pengaturan.rows[0]?.po_share_ttl_days ?? DEFAULT_SHARE_TTL_DAYS

      await tx.query(
        `update purchase_order_shares set revoked_at = now()
          where workspace_id = $1 and purchase_order_id = $2 and revoked_at is null`,
        [context.workspaceId, orderId],
      )

      const token = randomBytes(SHARE_TOKEN_BYTES).toString('base64url')

      await tx.query(
        `insert into purchase_order_shares
           (workspace_id, purchase_order_id, label, token_hash, expires_at, created_by)
         values ($1, $2, $3, $4, now() + make_interval(days => $5), $6)`,
        [
          context.workspaceId,
          orderId,
          input.label ?? null,
          hashShareToken(token),
          hari,
          context.userId,
        ],
      )

      const kedaluwarsa = new Date()
      kedaluwarsa.setDate(kedaluwarsa.getDate() + hari)

      return {
        token,
        expiresOn: kedaluwarsa.toISOString().slice(0, 10),
        number: row.number,
        supplierName: row.supplier_name,
      }
    })

    const url = `${webOrigin}/po/${dibuat.token}`

    if (input.sendTo) {
      await sendEmail({
        to: input.sendTo,
        subject: `Purchase order ${dibuat.number}`,
        body: [
          `Purchase order ${dibuat.number} untuk ${dibuat.supplierName} bisa dilihat di tautan berikut:`,
          '',
          url,
          '',
          `Tautan berlaku sampai ${dibuat.expiresOn}. Setelah tanggal itu alamat ini sudah tidak bisa dibuka.`,
          'Tautan ini hanya untuk dibaca. Supplier tidak bisa mengubah isi PO dari sana.',
        ].join('\n'),
      })
    }

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'purchase_order.shared',
      objectType: 'purchase_order',
      objectId: String(orderId),
      metadata: { expiresOn: dibuat.expiresOn, emailed: Boolean(input.sendTo) },
    })

    return reply.code(201).send({
      url,
      expiresOn: dibuat.expiresOn,
      emailed: Boolean(input.sendTo),
    })
  })

  app.post('/api/workspaces/:workspaceId/purchase-orders/:orderId/share/revoke', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)

    const order = await db.query<{ id: number }>(
      'select id from purchase_orders where id = $1 and workspace_id = $2',
      [orderId, context.workspaceId],
    )
    if (order.rows.length === 0) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'PO tidak ditemukan.' })
    }

    await db.query(
      `update purchase_order_shares set revoked_at = now()
        where workspace_id = $1 and purchase_order_id = $2 and revoked_at is null`,
      [context.workspaceId, orderId],
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'purchase_order.share_revoked',
      objectType: 'purchase_order',
      objectId: String(orderId),
    })

    return reply.code(200).send({ message: 'Tautan baca-saja sudah dicabut.' })
  })

  /** Unduhan PDF untuk anggota workspace. */
  app.get('/api/workspaces/:workspaceId/purchase-orders/:orderId/pdf', async (request, reply) => {
    const context = await requireCapability(db, request, 'purchase_orders.create')
    const orderId = idFrom(paramsOf(request).orderId)
    const order = await muatOrder(db, context.workspaceId, orderId)

    return reply
      .code(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="PO-${order.number}.pdf"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(await renderPurchaseOrderPdf(order))
  })

  /**
   * Halaman publik. Tanpa sesi: hanya token yang membuktikan hak akses, dan setiap
   * pembukaan dicatat. Token yang salah, dicabut, dan kedaluwarsa mendapat jawaban
   * yang sama supaya tidak bisa dipetakan.
   */
  app.get('/api/public/purchase-orders/:token', async (request, reply) => {
    const { order, items } = await muatShare(db, request)

    return reply
      .code(200)
      .header('Cache-Control', 'no-store')
      .send({
        number: order.number,
        statusLabel: orderStatusLabels[order.status] ?? order.status,
        orderedOn: order.ordered_on,
        expectedOn: order.expected_on,
        totalAmount: asNumber(order.total_amount),
        supplierName: order.supplier_name,
        supplierContactName: order.supplier_contact_name,
        supplierPhone: order.supplier_phone,
        supplierEmail: order.supplier_email,
        supplierAddress: order.supplier_address,
        locationName: order.location_name,
        workspaceName: order.workspace_name,
        note: order.note,
        items: items.map(toItem),
      })
  })

  app.get('/api/public/purchase-orders/:token/pdf', async (request, reply) => {
    const { order, items } = await muatShare(db, request)

    const pdf = await renderPurchaseOrderPdf({
      number: order.number,
      statusLabel: orderStatusLabels[order.status] ?? order.status,
      orderedOn: order.ordered_on,
      expectedOn: order.expected_on,
      note: order.note,
      totalAmount: asNumber(order.total_amount),
      workspaceName: order.workspace_name,
      supplierName: order.supplier_name,
      supplierContactName: order.supplier_contact_name,
      supplierPhone: order.supplier_phone,
      supplierEmail: order.supplier_email,
      supplierAddress: order.supplier_address,
      locationName: order.location_name,
      createdByName: '',
      approvedAt: order.approved_at ? new Date(order.approved_at).toISOString().slice(0, 10) : null,
      items: items.map(toItem),
    })

    return reply
      .code(200)
      .header('Content-Type', 'application/pdf')
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `inline; filename="PO-${order.number}.pdf"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(pdf)
  })
}

interface ShareStatus {
  active: boolean
  expiresOn: string
  revoked: boolean
  openCount: number
}

async function shareStatus(db: Database, workspaceId: number, orderId: number): Promise<ShareStatus | null> {
  const rows = await db.query<{
    expires_at: Date
    revoked_at: Date | null
    open_count: number
  }>(
    `select expires_at, revoked_at, open_count
       from purchase_order_shares
      where workspace_id = $1 and purchase_order_id = $2
      order by created_at desc
      limit 1`,
    [workspaceId, orderId],
  )

  const share = rows.rows[0]
  if (!share) return null

  const dicabut = share.revoked_at !== null
  const kedaluwarsa = new Date(share.expires_at).getTime() <= Date.now()

  return {
    active: !dicabut && !kedaluwarsa,
    expiresOn: new Date(share.expires_at).toISOString().slice(0, 10),
    revoked: dicabut,
    openCount: share.open_count,
  }
}

async function muatOrder(db: Database, workspaceId: number, orderId: number): Promise<PdfOrder> {
  const rows = await db.query<OrderHeaderRow>(
    `select o.number, o.status, to_char(o.ordered_on, 'YYYY-MM-DD') as ordered_on,
            o.expected_on, o.total_amount, o.note, o.approved_at,
            s.name as supplier_name, s.contact_name as supplier_contact_name,
            s.phone as supplier_phone, s.email as supplier_email, s.address as supplier_address,
            l.name as location_name, w.name as workspace_name,
            u.name as created_by_name
       from purchase_orders o
       join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
       join locations l on l.id = o.location_id and l.workspace_id = o.workspace_id
       join workspaces w on w.id = o.workspace_id
       join users u on u.id = o.created_by
      where o.workspace_id = $1 and o.id = $2`,
    [workspaceId, orderId],
  )

  const row = rows.rows[0]
  if (!row) {
    throw new StockError('tidak_ditemukan', 'PO tidak ditemukan.', 404)
  }

  const items = await db.query<OrderItemRow>(ORDER_ITEMS_QUERY, [workspaceId, orderId])

  return toPdfOrder(row, items.rows)
}

function toPdfOrder(row: OrderHeaderRow, items: OrderItemRow[]): PdfOrder {
  return {
    number: row.number,
    statusLabel: orderStatusLabels[row.status] ?? row.status,
    orderedOn: row.ordered_on,
    expectedOn: row.expected_on,
    note: row.note,
    totalAmount: asNumber(row.total_amount),
    workspaceName: row.workspace_name,
    supplierName: row.supplier_name,
    supplierContactName: row.supplier_contact_name,
    supplierPhone: row.supplier_phone,
    supplierEmail: row.supplier_email,
    supplierAddress: row.supplier_address,
    locationName: row.location_name,
    createdByName: row.created_by_name,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString().slice(0, 10) : null,
    items: items.map(toItem),
  }
}

/**
 * Membaca share lewat token, memeriksa masa berlakunya, lalu mencatat
 * pembukaannya sebelum mengembalikan isi.
 */
async function muatShare(
  db: Database,
  request: FastifyRequest,
): Promise<{ order: OrderHeaderRow; items: OrderItemRow[] }> {
  const tidakTersedia = new StockError(
    'tautan_tidak_tersedia',
    'Tautan ini sudah tidak berlaku. Minta pemilik toko mengirim ulang purchase order-nya.',
    404,
  )

  const token = paramsOf(request).token ?? ''
  if (token.length < 20) throw tidakTersedia

  const hasil = await db.query<OrderHeaderRow & { workspace_id: number; purchase_order_id: number }>(
    `select sh.workspace_id, sh.purchase_order_id,
            o.number, o.status, to_char(o.ordered_on, 'YYYY-MM-DD') as ordered_on,
            o.expected_on, o.total_amount, o.note, o.approved_at,
            s.name as supplier_name, s.contact_name as supplier_contact_name,
            s.phone as supplier_phone, s.email as supplier_email, s.address as supplier_address,
            l.name as location_name, w.name as workspace_name,
            ''::text as created_by_name
       from purchase_order_shares sh
       join purchase_orders o on o.id = sh.purchase_order_id and o.workspace_id = sh.workspace_id
       join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
       join locations l on l.id = o.location_id and l.workspace_id = o.workspace_id
       join workspaces w on w.id = o.workspace_id
      where sh.token_hash = $1
        and sh.revoked_at is null
        and sh.expires_at > now()`,
    [hashShareToken(token)],
  )

  const order = hasil.rows[0]
  if (!order) throw tidakTersedia

  const items = await db.query<OrderItemRow>(ORDER_ITEMS_QUERY, [
    order.workspace_id,
    order.purchase_order_id,
  ])

  await db.query(
    `update purchase_order_shares
        set open_count = open_count + 1, last_opened_at = now(), last_opened_ip = $2::inet
      where workspace_id = $1 and token_hash = $3`,
    [order.workspace_id, request.ip, hashShareToken(token)],
  )

  await writeAudit(db, {
    workspaceId: order.workspace_id,
    actorUserId: null,
    actorRole: 'viewer',
    action: 'purchase_order.share_opened',
    objectType: 'purchase_order',
    objectId: String(order.purchase_order_id),
    metadata: { ip: request.ip },
  })

  return { order, items: items.rows }
}

export { toPdfOrder }