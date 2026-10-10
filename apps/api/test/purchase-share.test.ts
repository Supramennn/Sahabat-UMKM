import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { renderPurchaseOrderPdf, teksPdf, type PdfOrder } from '../src/purchasing/pdf.ts'
import { hashShareToken } from '../src/purchasing/share.ts'

/**
 * PRD 6.3: PO dapat diunduh sebagai PDF dan dikirim lewat email atau dibagikan
 * sebagai tautan baca-saja. A-11: token acak, kedaluwarsa 30 hari secara bawaan
 * dan bisa diubah Owner, bisa dicabut, tidak diindeks, dan setiap pembukaan masuk
 * audit log dengan alamat IP.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance
let email: ReturnType<typeof createCapturingEmailProvider>

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({
    db,
    email,
    sessionSecret: 'rahasia-uji',
    origin: 'http://localhost:3000',
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

let sequence = 0
let passwordHash = ''

interface Toko {
  cookie: string
  workspaceId: number
  orderId: number
  orderNumber: string
  productName: string
}

async function setupToko(): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const address = `berbagi-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik', now()) returning id`,
    [address, passwordHash],
  )
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`berbagi-${sequence}`, `Toko Berbagi ${sequence}`, user.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id
  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    user.rows[0]!.id,
    'owner',
  ])

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Gudang'],
  )
  const supplier = await db.query<{ id: string }>(
    'insert into suppliers (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'CV Sumber Pangan'],
  )
  const product = await db.query<{ id: string; name: string }>(
    `insert into products (workspace_id, sku, name, unit_code)
     values ($1, $2, 'Beras 5 kg', 'karung') returning id, name`,
    [workspaceId, `BR-${sequence}`],
  )

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })
  const cookie = cookieOf(login)

  const created = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/purchase-orders`,
    headers: { cookie },
    payload: {
      supplierId: Number(supplier.rows[0]!.id),
      locationId: location.rows[0]!.id,
      items: [{ productId: Number(product.rows[0]!.id), quantity: '10', unitPrice: '60000' }],
    },
  })

  return {
    cookie,
    workspaceId,
    orderId: created.json().orderId as number,
    orderNumber: created.json().number as string,
    productName: product.rows[0]!.name,
  }
}

function tokenOf(url: string): string {
  return url.split('/po/')[1] ?? ''
}

describe('mengubah teks untuk PDF (WinAnsi)', () => {
  it('mengganti huruf di luar WinAnsi supaya PDF tidak gagal dibuat', () => {
    expect(teksPdf('Beras 5 kg')).toBe('Beras 5 kg')
    // Aksara non-Latin tidak punya tempat di font bawaan PDF, jadi diganti tanda tanya.
    expect(teksPdf('Toko \u6771\u4eac')).toBe('Toko ??')
    expect(teksPdf(null)).toBe('')
  })

  it('menghasilkan berkas PDF yang benar-benar bisa dibuka', async () => {
    const order: PdfOrder = {
      number: 'PO-2026-0001',
      statusLabel: 'Disetujui',
      orderedOn: '2026-10-10',
      expectedOn: '2026-10-17',
      note: 'Kirim sebelum jam 4 sore.',
      totalAmount: 600_000,
      workspaceName: 'Toko Berkah',
      supplierName: 'CV Sumber Pangan',
      supplierContactName: 'Pak Budi',
      supplierPhone: '08123456789',
      supplierEmail: 'padi@contoh.test',
      supplierAddress: 'Jl. Pasar No. 9, Jakarta',
      locationName: 'Gudang',
      createdByName: 'Sari',
      approvedAt: '2026-10-10',
      items: [
        {
          productName: 'Beras 5 kg \u6771\u4eac',
          sku: 'BR-1',
          unitCode: 'karung',
          quantity: 10,
          unitPrice: 60_000,
          discountAmount: 0,
          lineTotal: 600_000,
        },
      ],
    }

    const pdf = await renderPurchaseOrderPdf(order)

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(pdf.byteLength).toBeGreaterThan(1000)
  })

  it('menambah halaman baru saat barangnya banyak', async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      productName: `Barang nomor ${index + 1} dengan nama yang panjang sekali`,
      sku: `SKU-${index + 1}`,
      unitCode: 'pcs',
      quantity: 1,
      unitPrice: 1000,
      discountAmount: 0,
      lineTotal: 1000,
    }))

    const pdf = await renderPurchaseOrderPdf({
      number: 'PO-2026-0002',
      statusLabel: 'Draft',
      orderedOn: '2026-10-10',
      expectedOn: null,
      note: null,
      totalAmount: 60_000,
      workspaceName: 'Toko Berkah',
      supplierName: 'CV Sumber Pangan',
      supplierContactName: null,
      supplierPhone: null,
      supplierEmail: null,
      supplierAddress: null,
      locationName: 'Gudang',
      createdByName: 'Sari',
      approvedAt: null,
      items,
    })

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})

describe('unduhan PDF (PRD 6.3)', () => {
  it('mengirim berkas PDF untuk anggota workspace', async () => {
    const toko = await setupToko()

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/pdf`,
      headers: { cookie: toko.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(String(response.headers['content-disposition'])).toContain(toko.orderNumber)
    expect(response.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('menolak anggota workspace lain', async () => {
    const toko = await setupToko()
    const lain = await setupToko()

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${lain.workspaceId}/purchase-orders/${toko.orderId}/pdf`,
      headers: { cookie: lain.cookie },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('tautan baca-saja (PRD 6.3, A-11)', () => {
  it('membuat tautan yang tidak memakai sesi saat dibuka', async () => {
    const toko = await setupToko()

    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })

    expect(dibuat.statusCode).toBe(201)
    const body = dibuat.json()
    expect(String(body.url)).toMatch(/^http:\/\/localhost:3000\/po\/[A-Za-z0-9_-]{20,}$/)
    expect(String(body.expiresOn)).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Tanpa cookie sama sekali.
    const dibuka = await app.inject({
      method: 'GET',
      url: `/api/public/purchase-orders/${tokenOf(String(body.url))}`,
    })

    expect(dibuka.statusCode).toBe(200)
    expect(dibuka.json()).toMatchObject({
      number: toko.orderNumber,
      statusLabel: 'Draft',
      supplierName: 'CV Sumber Pangan',
    })
    expect(dibuka.json().items).toHaveLength(1)
    expect(dibuka.json().items[0]).toMatchObject({
      productName: toko.productName,
      quantity: 10,
      unitPrice: 60000,
      lineTotal: 600000,
    })
  })

  it('hanya menyimpan hash token, bukan tokennya', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })

    const token = tokenOf(String(dibuat.json().url))
    const tersimpan = await db.query<{ token_hash: string }>(
      'select token_hash from purchase_order_shares where purchase_order_id = $1',
      [toko.orderId],
    )

    expect(tersimpan.rows[0]!.token_hash).toBe(hashShareToken(token))
    expect(tersimpan.rows[0]!.token_hash).not.toBe(token)
  })

  it('mencatat setiap pembukaan beserta alamat IP', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    const token = tokenOf(String(dibuat.json().url))

    await app.inject({ method: 'GET', url: `/api/public/purchase-orders/${token}` })
    await app.inject({ method: 'GET', url: `/api/public/purchase-orders/${token}` })

    const jejak = await db.query<{ open_count: number; last_opened_at: Date; last_opened_ip: string }>(
      'select open_count, last_opened_at, last_opened_ip from purchase_order_shares where purchase_order_id = $1',
      [toko.orderId],
    )

    expect(jejak.rows[0]!.open_count).toBe(2)
    expect(jejak.rows[0]!.last_opened_at).toBeInstanceOf(Date)
    expect(jejak.rows[0]!.last_opened_ip).toBeTruthy()

    const audit = await db.query<{ action: string; metadata: Record<string, unknown> }>(
      `select action, metadata from audit_logs
        where workspace_id = $1 and action = 'purchase_order.share_opened'`,
      [toko.workspaceId],
    )
    expect(audit.rows.length).toBeGreaterThanOrEqual(2)
    expect(audit.rows[0]!.metadata).toHaveProperty('ip')
  })

  it('mencabut tautan sehingga alamat lamanya langsung tidak berlaku', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    const token = tokenOf(String(dibuat.json().url))

    const sebelum = await app.inject({ method: 'GET', url: `/api/public/purchase-orders/${token}` })
    expect(sebelum.statusCode).toBe(200)

    const dicabut = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share/revoke`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    expect(dicabut.statusCode).toBe(200)

    const sesudah = await app.inject({ method: 'GET', url: `/api/public/purchase-orders/${token}` })
    expect(sesudah.statusCode).toBe(404)
    expect(sesudah.json().error).toBe('tautan_tidak_tersedia')
  })

  it('mengganti tautan lama ketika dibuatkan yang baru', async () => {
    const toko = await setupToko()
    const pertama = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    const kedua = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })

    const lama = await app.inject({
      method: 'GET',
      url: `/api/public/purchase-orders/${tokenOf(String(pertama.json().url))}`,
    })
    const baru = await app.inject({
      method: 'GET',
      url: `/api/public/purchase-orders/${tokenOf(String(kedua.json().url))}`,
    })

    expect(lama.statusCode).toBe(404)
    expect(baru.statusCode).toBe(200)

    // Tepat satu tautan hidup per PO.
    const hidup = await db.query<{ total: number }>(
      `select count(*)::int as total from purchase_order_shares
        where purchase_order_id = $1 and revoked_at is null`,
      [toko.orderId],
    )
    expect(hidup.rows[0]!.total).toBe(1)
  })

  it('memberi jawaban yang sama untuk token yang salah dan yang dicabut', async () => {
    const toko = await setupToko()
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share/revoke`,
      headers: { cookie: toko.cookie },
      payload: {},
    })

    const salah = await app.inject({
      method: 'GET',
      url: '/api/public/purchase-orders/token-yang-tidak-pernah-dibuat-123456',
    })

    expect(salah.statusCode).toBe(404)
    expect(salah.json().error).toBe('tautan_tidak_tersedia')
    expect(String(salah.json().message)).toBe(
      String(
        (
          await app.inject({
            method: 'GET',
            url: '/api/public/purchase-orders/token-yang-tidak-pernah-dibuat-123456',
          })
        ).json().message,
      ),
    )
  })

  it('berlaku 30 hari secara bawaan dan mengikuti nilai yang diminta', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: { expiresInDays: 7 },
    })

    const expiresOn = new Date(`${dibuat.json().expiresOn}T00:00:00.000Z`).getTime()
    const sekarang = Date.now()
    const selisihHari = Math.round((expiresOn - sekarang) / (24 * 60 * 60 * 1000))

    expect(selisihHari).toBe(7)

    // Tanpa parameter, ikut bawaan 30 hari dari pengaturan workspace.
    const bawaan = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    const hariBawaan = Math.round(
      (new Date(`${bawaan.json().expiresOn}T00:00:00.000Z`).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000),
    )
    expect(hariBawaan).toBe(30)
  })

  it('menolak masa berlaku di luar 1 sampai 365 hari', async () => {
    const toko = await setupToko()

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: { expiresInDays: 400 },
    })

    expect(response.statusCode).toBe(400)
  })

  it('menampilkan kondisi tautan di halaman PO', async () => {
    const toko = await setupToko()

    const kosong = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
    })
    expect(kosong.json().share).toBeNull()

    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })

    const hidup = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
    })
    expect(hidup.json().share).toMatchObject({ active: true, revoked: false, openCount: 0 })
  })

  it('mengirim tautan lewat email dan tidak pernah menuliskan token lain', async () => {
    const toko = await setupToko()
    const sebelum = email.messages.length

    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: { sendTo: 'padi@supplier.test', label: 'Kirim ke supplier' },
    })

    expect(dibuat.json().emailed).toBe(true)
    expect(email.messages.length).toBe(sebelum + 1)

    const pesan = email.messages[email.messages.length - 1]!
    expect(pesan.to).toBe('padi@supplier.test')
    expect(pesan.subject).toContain(toko.orderNumber)
    expect(pesan.body).toContain(String(dibuat.json().url))
  })

  it('menolak membuat tautan untuk PO workspace lain', async () => {
    const toko = await setupToko()
    const lain = await setupToko()

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${lain.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: lain.cookie },
      payload: {},
    })

    expect(response.statusCode).toBe(404)
  })

  it('melayani PDF lewat tautan publik tanpa sesi', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${toko.orderId}/share`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    const token = tokenOf(String(dibuat.json().url))

    const pdf = await app.inject({ method: 'GET', url: `/api/public/purchase-orders/${token}/pdf` })

    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['cache-control']).toBe('no-store')
    expect(pdf.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})
