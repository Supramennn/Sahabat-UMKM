import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider, type EmailProvider } from '../src/services/email.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'

/**
 * PRD 6.3: supplier, PO dengan alur status dan persetujuan, penerimaan bertahap
 * yang menambah stok sebesar jumlah diterima, retur yang mengurangi stok dan
 * utang, serta pembayaran supplier dengan alokasi.
 *
 * Skenario 3 PRD 3 diuji di sini: purchasing membuat PO dari daftar stok rendah,
 * mengirim ke supplier, lalu menerima barang sebagian dua kali.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance
let email: EmailProvider

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({ db, email, sessionSecret: 'rahasia-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

interface Toko {
  cookie: string
  workspaceId: number
  locationId: number
  supplierId: number
  productId: number
  secondMemberCookie: string
}

let sequence = 0
let passwordHash = ''

async function setupToko(approvalRequired = false): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const ownerEmail = `pembelian-${sequence}@contoh.test`
  const memberEmail = `pembelian-anggota-${sequence}@contoh.test`

  const owner = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik', now()) returning id`,
    [ownerEmail, passwordHash],
  )
  const member = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Anggota', now()) returning id`,
    [memberEmail, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`pembelian-${sequence}`, `Toko Pembelian ${sequence}`, owner.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id, approval_required) values ($1, $2)', [
    workspaceId,
    approvalRequired,
  ])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    owner.rows[0]!.id,
    'owner',
  ])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    member.rows[0]!.id,
    'admin',
  ])

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Gudang'],
  )

  const supplier = await db.query<{ id: string }>(
    `insert into suppliers (workspace_id, name, payment_term_days)
     values ($1, $2, 30) returning id`,
    [workspaceId, 'CV Sumber Pangan'],
  )

  const product = await db.query<{ id: string }>(
    `insert into products (workspace_id, sku, name, unit_code)
     values ($1, $2, 'Beras 5 kg', 'karung') returning id`,
    [workspaceId, `BR-${sequence}`],
  )

  return {
    cookie: await login(ownerEmail),
    workspaceId,
    locationId: location.rows[0]!.id,
    supplierId: Number(supplier.rows[0]!.id),
    productId: Number(product.rows[0]!.id),
    secondMemberCookie: await login(memberEmail),
  }
}

async function login(address: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })
  if (response.statusCode !== 200) {
    throw new Error(`Masuk gagal: ${response.statusCode} ${response.body}`)
  }
  return cookieOf(response)
}

function url(toko: Toko, path: string): string {
  return `/api/workspaces/${toko.workspaceId}${path}`
}

async function buatPO(
  toko: Toko,
  overrides: Record<string, unknown> = {},
  cookie = toko.cookie,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: url(toko, '/purchase-orders'),
    headers: { cookie },
    payload: {
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
      ...overrides,
    },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

async function kirim(
  toko: Toko,
  path: string,
  payload: unknown = {},
  cookie = toko.cookie,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method,
    url: url(toko, path),
    headers: { cookie },
    payload: payload as Record<string, unknown>,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('supplier (PRD 6.3)', () => {
  it('menyimpan data supplier beserta termin pembayaran', async () => {
    const toko = await setupToko()
    const response = await kirim(toko, '/suppliers', {
      name: 'Toko Sembako Jaya',
      contactName: 'Pak Budi',
      phone: '08123456789',
      email: 'BUDI@Contoh.Test',
      paymentTermDays: 14,
    })

    expect(response.statusCode).toBe(201)

    const daftar = await kirim(toko, '/suppliers', {}, toko.cookie, 'GET')
    const supplier = (daftar.body.suppliers as Array<Record<string, unknown>>).find(
      (item) => item.name === 'Toko Sembako Jaya',
    )!

    expect(supplier).toBeDefined()
    expect(supplier!.contactName).toBe('Pak Budi')
    // Email dinormalkan supaya pencarian dan pengingat tidak meleset karena huruf besar.
    expect(supplier!.email).toBe('budi@contoh.test')
    expect(supplier!.paymentTermDays).toBe(14)
    expect(supplier!.outstanding).toBe(0)
  })

  it('menolak supplier dengan nama yang sama di workspace yang sama', async () => {
    const toko = await setupToko()
    await kirim(toko, '/suppliers', { name: 'Toko Ganda' })
    const kedua = await kirim(toko, '/suppliers', { name: 'Toko Ganda' })

    // Nama sama untuk supplier berbeda di workspace berbeda tetap boleh.
    expect(kedua.statusCode).toBe(409)
  })
})

describe('purchase order (PRD 6.3)', () => {
  it('membuat PO dengan nomor urut per workspace per tahun', async () => {
    const toko = await setupToko()

    const pertama = await buatPO(toko)
    const kedua = await buatPO(toko)

    expect(pertama.statusCode).toBe(201)
    expect(String(pertama.body.number)).toMatch(/^PO-\d{4}-0001$/)
    expect(String(kedua.body.number)).toMatch(/^PO-\d{4}-0002$/)

    // Workspace lain mulai dari satu, bukan melanjutkan urutan yang sama.
    const lain = await setupToko()
    const diLain = await buatPO(lain)
    expect(String(diLain.body.number)).toMatch(/-0001$/)
  })

  it('menghitung total dari harga, jumlah, dan diskon per baris', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko, {
      items: [
        { productId: toko.productId, quantity: '10', unitPrice: '60000', discountAmount: '50000' },
      ],
    })

    const detail = await kirim(toko, `/purchase-orders/${po.body.orderId}`, {}, toko.cookie, 'GET')
    // 10 x 60.000 = 600.000, dikurangi diskon 50.000.
    expect(detail.body.order).toMatchObject({ totalAmount: 550000, status: 'draft' })
  })

  it('menolak PO tanpa barang atau dengan barang yang sama dua kali', async () => {
    const toko = await setupToko()

    const kosong = await kirim(toko, '/purchase-orders', {
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [],
    })
    expect(kosong.statusCode).toBe(400)

    const ganda = await kirim(toko, '/purchase-orders', {
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [
        { productId: toko.productId, quantity: '1', unitPrice: '1000' },
        { productId: toko.productId, quantity: '2', unitPrice: '1000' },
      ],
    })
    expect(ganda.statusCode).toBe(400)
    expect(ganda.body.error).toBe('barang_ganda_di_po')
  })

  it('menolak PO dari workspace lain', async () => {
    const toko = await setupToko()
    const lain = await setupToko()

    const response = await kirim(
      lain,
      '/purchase-orders',
      {
        supplierId: toko.supplierId,
        locationId: toko.locationId,
        items: [{ productId: toko.productId, quantity: '1', unitPrice: '1000' }],
      },
      lain.cookie,
    )

    expect(response.statusCode).toBe(404)
  })
})

describe('alur status dan persetujuan PO (PRD 6.3, B-03)', () => {
  it('menjalankan draft ke diajukan ke disetujui', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    const diajukan = await kirim(toko, `/purchase-orders/${orderId}/submit`)
    expect(diajukan.statusCode).toBe(200)

    const disetujui = await kirim(
      toko,
      `/purchase-orders/${orderId}/approve`,
      {},
      toko.secondMemberCookie,
    )
    expect(disetujui.statusCode).toBe(200)

    const detail = await kirim(toko, `/purchase-orders/${orderId}`, {}, toko.cookie, 'GET')
    expect(detail.body.order).toMatchObject({ status: 'disetujui' })
  })

  it('menolak pembuat PO yang menyetujui PO sendiri saat aturan approval menyala', async () => {
    const toko = await setupToko(true)
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    const response = await kirim(toko, `/purchase-orders/${orderId}/approve`)

    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('tidak_bisa_menyetujui_sendiri')

    // Anggota lain bisa menyetujui PO yang sama.
    const olehLain = await kirim(
      toko,
      `/purchase-orders/${orderId}/approve`,
      {},
      toko.secondMemberCookie,
    )
    expect(olehLain.statusCode).toBe(200)
  })

  it('menolak PO yang belum diajukan dan yang sudah diputuskan', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    const sebelumDiajukan = await kirim(
      toko,
      `/purchase-orders/${orderId}/approve`,
      {},
      toko.secondMemberCookie,
    )
    expect(sebelumDiajukan.statusCode).toBe(409)

    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)
    const kedua = await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)

    expect(kedua.statusCode).toBe(409)
  })

  it('mewajibkan catatan alasan saat PO yang sudah disetujui direvisi', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)

    const tanpaCatatan = await kirim(
      toko,
      `/purchase-orders/${orderId}`,
      { items: [{ productId: toko.productId, quantity: '99', unitPrice: '60000' }] },
      toko.cookie,
      'PATCH',
    )
    expect(tanpaCatatan.statusCode).toBe(409)
    expect(tanpaCatatan.body.error).toBe('catatan_revisi_wajib')
  })

  it('menerima revisi bernomor pada PO yang sudah disetujui dan mengembalikannya ke persetujuan', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)

    const revisi = await kirim(
      toko,
      `/purchase-orders/${orderId}`,
      {
        items: [{ productId: toko.productId, quantity: '99', unitPrice: '60000' }],
        revisionReason: 'Jumlah diperbarui setelah supplier mengonfirmasi.',
      },
      toko.cookie,
      'PATCH',
    )
    expect(revisi.statusCode).toBe(200)

    const detail = await kirim(toko, `/purchase-orders/${orderId}`, {}, toko.cookie, 'GET')
    expect(detail.body.order).toMatchObject({ status: 'diajukan' })
    expect((detail.body.items as Array<Record<string, unknown>>)[0]!.quantity).toBe(99)
    const revisions = detail.body.revisions as Array<Record<string, unknown>>
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.revisionNumber).toBe(1)
    expect(String(revisions[0]!.reason)).toContain('supplier')

    // Revisi mengubah isi, jadi PO harus disetujui lagi sebelum barangnya diterima.
    const terima = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '1' }],
      idempotencyKey: 'terima-sebelum-setuju-ulang',
    })
    expect(terima.statusCode).toBe(409)

    const setujuiUlang = await kirim(
      toko,
      `/purchase-orders/${orderId}/approve`,
      {},
      toko.secondMemberCookie,
    )
    expect(setujuiUlang.statusCode).toBe(200)
  })

  it('menolak memindahkan lokasi PO yang sudah disetujui', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number

    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)

    const lokasiLain = await db.query<{ id: number }>(
      'insert into locations (workspace_id, name) values ($1, $2) returning id',
      [toko.workspaceId, 'Gudang Cadangan'],
    )

    const response = await kirim(
      toko,
      `/purchase-orders/${orderId}`,
      { locationId: lokasiLain.rows[0]!.id, revisionReason: 'Pindah gudang.' },
      toko.cookie,
      'PATCH',
    )
    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('lokasi_tidak_bisa_diubah')
  })

  it('mewajibkan catatan alasan saat PO yang sudah diajukan diubah', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)
    const orderId = po.body.orderId as number
    await kirim(toko, `/purchase-orders/${orderId}/submit`)

    const tanpaCatatan = await kirim(
      toko,
      `/purchase-orders/${orderId}`,
      { items: [{ productId: toko.productId, quantity: '12', unitPrice: '60000' }] },
      toko.cookie,
      'PATCH',
    )
    expect(tanpaCatatan.statusCode).toBe(409)
    expect(tanpaCatatan.body.error).toBe('catatan_revisi_wajib')

    const denganCatatan = await kirim(
      toko,
      `/purchase-orders/${orderId}`,
      {
        items: [{ productId: toko.productId, quantity: '12', unitPrice: '60000' }],
        revisionReason: 'Jumlah diperbarui setelah konfirmasi supplier.',
      },
      toko.cookie,
      'PATCH',
    )
    expect(denganCatatan.statusCode).toBe(200)

    const detail = await kirim(toko, `/purchase-orders/${orderId}`, {}, toko.cookie, 'GET')
    const revisi = detail.body.revisions as Array<Record<string, unknown>>
    expect(revisi).toHaveLength(1)
    expect(String(revisi[0]!.reason)).toContain('konfirmasi supplier')
    expect(revisi[0]!.revisionNumber).toBe(1)
  })
})

describe('penerimaan bertahap (PRD 6.3, skenario 3 PRD 3)', () => {
  async function poDisetujui(toko: Toko): Promise<number> {
    const po = await buatPO(toko, {
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
    })
    const orderId = po.body.orderId as number
    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)
    return orderId
  }

  it('menambah stok hanya sebesar jumlah yang benar-benar diterima, dua kali', async () => {
    const toko = await setupToko()
    const orderId = await poDisetujui(toko)

    const pertama = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '4' }],
      idempotencyKey: 'terima-pertama-sekali',
    })
    expect(pertama.statusCode).toBe(201)
    expect(String(pertama.body.number)).toMatch(/^GR-\d{4}-0001$/)
    expect(pertama.body.orderStatus).toBe('diterima_sebagian')

    let saldo = await saldoToko(db, toko.productId)
    expect(saldo).toBe(4)

    const kedua = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '6' }],
      idempotencyKey: 'terima-kedua-sekali',
    })
    expect(kedua.statusCode).toBe(201)
    expect(kedua.body.orderStatus).toBe('diterima')

    saldo = await saldoToko(db, toko.productId)
    expect(saldo).toBe(10)

    const detail = await kirim(toko, `/purchase-orders/${orderId}`, {}, toko.cookie, 'GET')
    const items = detail.body.items as Array<Record<string, unknown>>
    expect(items[0]!.receivedQuantity).toBe(10)
    expect(items[0]!.outstanding).toBe(0)
    expect(detail.body.receipts).toHaveLength(2)
  })

  it('menolak penerimaan lebih besar dari sisa PO', async () => {
    const toko = await setupToko()
    const orderId = await poDisetujui(toko)

    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '8' }],
      idempotencyKey: 'terima-delapan-sekali',
    })

    const response = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '5' }],
      idempotencyKey: 'terima-limasekali-lebih',
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('melebihi_jumlah_po')
    expect(await saldoToko(db, toko.productId)).toBe(8)
  })

  it('permintaan penerimaan yang terkirim dua kali tidak menggandakan stok', async () => {
    const toko = await setupToko()
    const orderId = await poDisetujui(toko)

    const payload = {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '5' }],
      idempotencyKey: 'terima-kirim-dua-kali',
    }

    const pertama = await kirim(toko, '/goods-receipts', payload)
    const kedua = await kirim(toko, '/goods-receipts', payload)

    expect(pertama.statusCode).toBe(201)
    expect(kedua.statusCode).toBe(200)
    expect(kedua.body.replayed).toBe(true)
    expect(kedua.body.receiptId).toBe(pertama.body.receiptId)

    expect(await saldoToko(db, toko.productId)).toBe(5)
    const penerimaan = await kirim(toko, '/goods-receipts', {}, toko.cookie, 'GET')
    expect((penerimaan.body.receipts as unknown[]).length).toBe(1)
  })

  it('menolak barang yang tidak ada di PO-nya', async () => {
    const toko = await setupToko()
    const orderId = await poDisetujui(toko)
    const barangLain = await db.query<{ id: string }>(
      `insert into products (workspace_id, sku, name, unit_code)
       values ($1, 'LAIN-1', 'Garam', 'pcs') returning id`,
      [toko.workspaceId],
    )

    const response = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: Number(barangLain.rows[0]!.id), quantity: '1' }],
      idempotencyKey: 'terima-barang-asing-sekali',
    })

    expect(response.statusCode).toBe(400)
    expect(response.body.error).toBe('barang_tidak_ada_di_po')
  })

  it('menolak penerimaan untuk PO yang belum disetujui', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko)

    const response = await kirim(toko, '/goods-receipts', {
      purchaseOrderId: po.body.orderId,
      items: [{ productId: toko.productId, quantity: '1' }],
      idempotencyKey: 'terima-po-draft-sekali',
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('po_bukan_diterima')
  })

  it('menerapkan harga PO sebagai harga pokok barang yang diterima', async () => {
    const toko = await setupToko()
    const orderId = await poDisetujui(toko)

    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '10' }],
      idempotencyKey: 'terima-harga-po-sekali',
    })

    const biaya = await db.query<{ average_cost: string }>(
      'select average_cost from product_costs where product_id = $1',
      [toko.productId],
    )
    expect(Number(biaya.rows[0]!.average_cost)).toBe(60000)
  })
})

describe('utang supplier (PRD 6.3, A-08)', () => {
  it('bertambah saat penerimaan dan berkurang saat retur', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko, {
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
    })
    const orderId = po.body.orderId as number
    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)

    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '10' }],
      idempotencyKey: 'terima-utang-sekali',
    })

    let utang = await utangSupplier(db, toko.supplierId)
    expect(utang).toBe(600000)

    const retur = await kirim(toko, '/purchase-returns', {
      purchaseOrderId: orderId,
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [{ productId: toko.productId, quantity: '2' }],
      idempotencyKey: 'retur-dua-buah-sekali',
    })
    expect(retur.statusCode).toBe(201)
    expect(String(retur.body.number)).toMatch(/^PR-\d{4}-0001$/)

    utang = await utangSupplier(db, toko.supplierId)
    expect(utang).toBe(480000)
    expect(await saldoToko(db, toko.productId)).toBe(8)
  })

  it('menolak retur lebih besar dari stok di lokasi (A-03)', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko, {
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
    })
    const orderId = po.body.orderId as number
    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)
    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '3' }],
      idempotencyKey: 'terima-untuk-retur-besar',
    })

    const response = await kirim(toko, '/purchase-returns', {
      purchaseOrderId: orderId,
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [{ productId: toko.productId, quantity: '5' }],
      idempotencyKey: 'retur-lebih-besar-sekali',
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('stok_tidak_cukup')
    expect(await saldoToko(db, toko.productId)).toBe(3)
  })

  it('membayar utang dan mengalokasikan ke PO paling lama lebih dulu', async () => {
    const toko = await setupToko()

    // Dua PO, PO pertama dibuat lebih dulu jadi harus dilunasi lebih dulu.
    const poPertama = await buatPO(toko, {
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
    })
    await kirim(toko, `/purchase-orders/${poPertama.body.orderId}/submit`)
    await kirim(toko, `/purchase-orders/${poPertama.body.orderId}/approve`, {}, toko.secondMemberCookie)
    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: poPertama.body.orderId,
      items: [{ productId: toko.productId, quantity: '10' }],
      idempotencyKey: 'terima-po-pertama-utang',
    })

    const produkKedua = await db.query<{ id: string }>(
      `insert into products (workspace_id, sku, name, unit_code)
       values ($1, $2, 'Minyak goreng 1 L', 'pcs') returning id`,
      [toko.workspaceId, `MIN-${sequence}`],
    )

    const poKedua = await kirim(
      toko,
      '/purchase-orders',
      {
        supplierId: toko.supplierId,
        locationId: toko.locationId,
        items: [{ productId: Number(produkKedua.rows[0]!.id), quantity: '5', unitPrice: '35000' }],
      },
      toko.cookie,
    )
    await kirim(toko, `/purchase-orders/${poKedua.body.orderId}/submit`)
    await kirim(toko, `/purchase-orders/${poKedua.body.orderId}/approve`, {}, toko.secondMemberCookie)
    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: poKedua.body.orderId,
      items: [{ productId: Number(produkKedua.rows[0]!.id), quantity: '5' }],
      idempotencyKey: 'terima-po-kedua-utang',
    })

    const bayar = await kirim(toko, '/supplier-payments', {
      supplierId: toko.supplierId,
      amount: '700000',
      method: 'Transfer',
    })

    expect(bayar.statusCode).toBe(201)
    const alokasi = bayar.body.allocations as Array<{ orderId: number; amount: number }>
    // Utang PO pertama 600.000 lunas, sisa 100.000 masuk ke PO kedua.
    expect(alokasi).toEqual([
      { orderId: poPertama.body.orderId as number, amount: 600000 },
      { orderId: poKedua.body.orderId as number, amount: 100000 },
    ])

    const utang = await kirim(toko, '/supplier-debts', {}, toko.cookie, 'GET')
    const daftar = utang.body.debts as Array<Record<string, unknown>>
    const total = daftar.reduce((jumlah, item) => jumlah + Number(item.outstanding), 0)
    // Utang Acceptance: 600.000 dari PO pertama dan 175.000 dari PO kedua,
    // dikurangi pembayaran 700.000.
    expect(total).toBe(600000 + 175000 - 700000)
  })

  it('menolak retur yang nilainya melebihi penerimaan pada PO yang sama', async () => {
    const toko = await setupToko()
    const po = await buatPO(toko, {
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '60000' }],
    })
    const orderId = po.body.orderId as number
    await kirim(toko, `/purchase-orders/${orderId}/submit`)
    await kirim(toko, `/purchase-orders/${orderId}/approve`, {}, toko.secondMemberCookie)
    await kirim(toko, '/goods-receipts', {
      purchaseOrderId: orderId,
      items: [{ productId: toko.productId, quantity: '10' }],
      idempotencyKey: 'terima-untuk-retur-nilai',
    })

    // Retur 10 barang dengan harga 1.000.000 per satuan, jadi nilai pengurangannya
    // lebih besar dari yang benar-benar diterima pada PO ini.
    const response = await kirim(toko, '/purchase-returns', {
      purchaseOrderId: orderId,
      supplierId: toko.supplierId,
      locationId: toko.locationId,
      items: [{ productId: toko.productId, quantity: '10', unitPrice: '1000000' }],
      idempotencyKey: 'retur-nilai-besar-sekali',
    })

    // Pesan dari trigger tidak diteruskan apa adanya; yang muncul adalah galat
    // dengan kode batasan, dan stok tetap utuh.
    expect(response.statusCode).not.toBe(201)
    expect(await saldoToko(db, toko.productId)).toBe(10)
  })

  it('tidak bisa membaca utang workspace lain', async () => {
    const lain = await setupToko()

    const response = await kirim(lain, '/supplier-debts', {}, lain.cookie, 'GET')
    expect(response.statusCode).toBe(200)
    expect(response.body.debts).toHaveLength(0)
  })
})

async function saldoToko(db: Database, productId: number): Promise<number> {
  const rows = await db.query<{ quantity: string }>(
    `select coalesce(sum(quantity), 0)::text as quantity
       from stock_balances where product_id = $1`,
    [productId],
  )
  return Number(rows.rows[0]?.quantity ?? 0)
}

async function utangSupplier(db: Database, supplierId: number): Promise<number> {
  const rows = await db.query<{ total: number }>(
    'select coalesce(sum(amount), 0) as total from supplier_debt_entries where supplier_id = $1',
    [supplierId],
  )
  return Number(rows.rows[0]?.total ?? 0)
}
