import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { mergeSaleItems } from '../src/sales/service.ts'

/**
 * PRD 6.4: mencatat penjualan dengan lokasi, item, harga jual, diskon, metode
 * pembayaran, dan pelanggan opsional. Penjualan mengurangi stok dengan aturan yang
 * sama seperti stok keluar, pembatalan membuat transaksi pembalik, dan laba kotor
 * memakai harga pokok rata-rata bergerak pada saat penjualan (PRD 7, A-07).
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance

beforeAll(async () => {
  db = await createTestDatabase()
  app = await buildApp({ db, sessionSecret: 'rahasia-uji', origin: 'http://localhost:3000' })
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
  productId: number
  staffCookie: string
}

let sequence = 0
let passwordHash = ''

async function setupToko(): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const ownerEmail = `penjualan-${sequence}@contoh.test`
  const staffEmail = `penjualan-staf-${sequence}@contoh.test`

  const owner = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik', now()) returning id`,
    [ownerEmail, passwordHash],
  )
  const staff = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Staf', now()) returning id`,
    [staffEmail, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`penjualan-${sequence}`, `Toko Penjualan ${sequence}`, owner.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    owner.rows[0]!.id,
    'owner',
  ])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    staff.rows[0]!.id,
    'staff',
  ])

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Kios'],
  )

  const product = await db.query<{ id: string }>(
    `insert into products (workspace_id, sku, name, unit_code, selling_price)
     values ($1, $2, 'Kopi bubuk 250 g', 'bungkus', 45000) returning id`,
    [workspaceId, `KP-${sequence}`],
  )
  const productId = Number(product.rows[0]!.id)
  await db.query('insert into product_costs (workspace_id, product_id) values ($1, $2)', [
    workspaceId,
    productId,
  ])

  return {
    cookie: await login(ownerEmail),
    workspaceId,
    locationId: location.rows[0]!.id,
    productId,
    staffCookie: await login(staffEmail),
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

async function catatMasuk(
  toko: Toko,
  quantity: number,
  unitCost: number,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.workspaceId}/stock/movements`,
    headers: { cookie: toko.cookie },
    payload: {
      productId: toko.productId,
      locationId: toko.locationId,
      kind: 'masuk',
      direction: 'tambah',
      quantity,
      unitCost,
      reasonCode: 'pembelian',
      occurredOn: '2026-10-01',
    },
  })
  if (response.statusCode !== 201) {
    throw new Error(`Input barang masuk gagal: ${response.statusCode} ${response.body}`)
  }
}

async function jual(
  toko: Toko,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.workspaceId}/sales`,
    headers: { cookie: toko.cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('Pencatatan penjualan', () => {
  it('mengurangi stok, memberi nomor INV, dan menghitung laba kotor dari harga pokok snapshot', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const hasil = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 2, unitPrice: 45_000 }],
      idempotencyKey: `jual-Inv-${sequence}-a`,
    })

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.number).toBe('INV-2026-0001')
    expect(hasil.body.totalAmount).toBe(90_000)
    expect(hasil.body.costTotal).toBe(60_000)
    expect(hasil.body.grossProfit).toBe(30_000)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(8)
  })

  it('memotong diskon per baris dan menjumlahkannya ke total penjualan', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const hasil = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'QRIS',
      items: [
        { productId: toko.productId, quantity: 2, unitPrice: 45_000, discountAmount: 10_000 },
      ],
      idempotencyKey: `jual-diskon-${sequence}`,
    })

    expect(hasil.body.subtotal).toBeUndefined()
    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/sales/${hasil.body.saleId}`,
      headers: { cookie: toko.cookie },
    })
    const isi = detail.json()
    expect(isi.sale.subtotal).toBe(90_000)
    expect(isi.sale.discountTotal).toBe(10_000)
    expect(isi.sale.totalAmount).toBe(80_000)
    expect(isi.sale.costTotal).toBe(60_000)
  })

  it('menolak penjualan yang melebihi stok yang ada dan tidak mengubah saldo', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 3, 30_000)

    const sebelum = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )

    const hasil = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 5, unitPrice: 45_000 }],
      idempotencyKey: `jual-kurang-${sequence}`,
    })

    expect(hasil.statusCode).toBe(409)
    expect(hasil.body.error).toBe('stok_tidak_cukup')
    expect(String(hasil.body.message)).toContain('Kopi bubuk 250 g')
    expect(String(hasil.body.message)).toContain('Kios')

    const sesudah = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(sesudah.rows[0]!.quantity).toBe(sebelum.rows[0]!.quantity)

    const penjualan = await db.query('select 1 from sales where workspace_id = $1', [toko.workspaceId])
    expect(penjualan.rows).toHaveLength(0)
  })

  it('menggabungkan dua baris untuk produk yang sama sebelum memeriksa stok', () => {
    const merged = mergeSaleItems([
      { productId: 7, quantity: 1, unitPrice: 10_000 },
      { productId: 7, quantity: 2, unitPrice: 10_000, discountAmount: 5_000 },
      { productId: 9, quantity: 1, unitPrice: 2_000 },
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]!.quantity).toBe(3)
    expect(merged[0]!.discountAmount).toBe(5_000)
  })

  it('menolak diskon yang lebih besar dari nilai barang', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 5, 30_000)

    const hasil = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [
        { productId: toko.productId, quantity: 1, unitPrice: 10_000, discountAmount: 20_000 },
      ],
      idempotencyKey: `jual-diskon-kebesaran-${sequence}`,
    })

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('diskon_terlalu_besar')
  })

  it('permintaan dengan kunci idempotency yang sama tidak menggandakan penjualan', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const payload = {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-ulangan-${sequence}`,
    }

    const pertama = await jual(toko, payload)
    const kedua = await jual(toko, payload)

    expect(kedua.body.replayed).toBe(true)
    expect(kedua.body.saleId).toBe(pertama.body.saleId)

    const jumlah = await db.query<{ total: string }>(
      'select count(*) as total from sales where workspace_id = $1',
      [toko.workspaceId],
    )
    expect(Number(jumlah.rows[0]!.total)).toBe(1)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(9)
  })

  it('staf boleh mencatat penjualan, Viewer tidak', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 5, 30_000)

    const olehStaf = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/sales`,
      headers: { cookie: toko.staffCookie },
      payload: {
        locationId: toko.locationId,
        soldOn: '2026-10-02',
        paymentMethodLabel: 'Tunai',
        items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
        idempotencyKey: `jual-staf-${sequence}`,
      },
    })
    expect(olehStaf.statusCode).toBe(201)

    const viewer = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, $2, 'Pengamat', now()) returning id`,
      [`penjualan-viewer-${sequence}@contoh.test`, passwordHash],
    )
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      toko.workspaceId,
      viewer.rows[0]!.id,
      'viewer',
    ])
    const cookieViewer = await login(`penjualan-viewer-${sequence}@contoh.test`)

    const olehViewer = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/sales`,
      headers: { cookie: cookieViewer },
      payload: {
        locationId: toko.locationId,
        soldOn: '2026-10-02',
        paymentMethodLabel: 'Tunai',
        items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
        idempotencyKey: `jual-viewer-${sequence}`,
      },
    })
    expect(olehViewer.statusCode).toBe(403)

    // Viewer boleh membaca daftar penjualan lewat izin laporan penjualan (PRD 8).
    const dibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/sales`,
      headers: { cookie: cookieViewer },
    })
    expect(dibaca.statusCode).toBe(200)
  })
})

describe('Pembatalan penjualan', () => {
  it('mengembalikan stok dengan baris ledger baru dan tidak menghapus baris lama', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const dibuat = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 4, unitPrice: 45_000 }],
      idempotencyKey: `jual-batal-${sequence}`,
    })
    const saleId = dibuat.body.saleId as number

    const batal = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/sales/${saleId}/cancel`,
      headers: { cookie: toko.cookie },
      payload: { reason: 'Salah input jumlah', cancelledOn: '2026-10-03' },
    })
    expect(batal.statusCode).toBe(200)
    expect(batal.json().reversedMovements).toBe(1)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(10)

    const gerak = await db.query<{ kind: string; direction: string; quantity: string }>(
      `select kind, direction, quantity from stock_movements
        where workspace_id = $1 and product_id = $2 and location_id = $3
        order by id`,
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(gerak.rows).toHaveLength(3)
    expect(gerak.rows[1]).toMatchObject({ kind: 'keluar', direction: 'kurang' })
    expect(gerak.rows[2]).toMatchObject({ kind: 'masuk', direction: 'tambah' })

    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/sales/${saleId}`,
      headers: { cookie: toko.cookie },
    })
    expect(detail.json().sale.status).toBe('dibatalkan')
    expect(detail.json().sale.statusLabel).toBe('Dibatalkan')
  })

  it('menolak pembatalan dua kali tanpa menambah stok lagi', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const dibuat = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 2, unitPrice: 45_000 }],
      idempotencyKey: `jual-batal-dua-${sequence}`,
    })
    const saleId = dibuat.body.saleId as number
    const url = `/api/workspaces/${toko.workspaceId}/sales/${saleId}/cancel`

    await app.inject({
      method: 'POST',
      url,
      headers: { cookie: toko.cookie },
      payload: { cancelledOn: '2026-10-03' },
    })
    const kedua = await app.inject({
      method: 'POST',
      url,
      headers: { cookie: toko.cookie },
      payload: { cancelledOn: '2026-10-03' },
    })

    expect(kedua.statusCode).toBe(200)
    expect(kedua.json().replayed).toBe(true)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(10)
  })
})

describe('Harga pokok snapshot (A-07)', () => {
  it('laba penjualan lama tidak berubah setelah ada penerimaan baru', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const dijual = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 2, unitPrice: 45_000 }],
      idempotencyKey: `jual-snapshot-${sequence}`,
    })
    const labaSaatTransaksi = dijual.body.grossProfit

    // Penerimaan baru menaikkan rata-rata bergerak. Saldo saat itu 8 (@ Rp30.000)
    // lalu masuk 10 @ Rp50.000, jadi rata-rata bukan lagi Rp40.000.
    await catatMasuk(toko, 10, 50_000)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/sales/${dijual.body.saleId}`,
      headers: { cookie: toko.cookie },
    })
    const isi = detail.json()
    expect(isi.sale.grossProfit).toBe(labaSaatTransaksi)
    expect(isi.sale.grossProfit).toBe(30_000)
    expect(isi.items[0].unitCostSnapshot).toBe(30_000)

    const biaya = await db.query<{ average_cost: string }>(
      'select average_cost from product_costs where workspace_id = $1 and product_id = $2',
      [toko.workspaceId, toko.productId],
    )
    expect(Number(biaya.rows[0]!.average_cost)).toBeCloseTo((8 * 30_000 + 10 * 50_000) / 18, 3)
  })

  it('pembatalan mengembalikan barang pada harga pokok saat terjual', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const dijual = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 5, unitPrice: 45_000 }],
      idempotencyKey: `jual-batal-harga-${sequence}`,
    })
    const saleId = dijual.body.saleId as number

    await catatMasuk(toko, 10, 90_000)

    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/sales/${saleId}/cancel`,
      headers: { cookie: toko.cookie },
      payload: { cancelledOn: '2026-10-03' },
    })

    // Sebelum pembatalan saldo 15 dengan rata-rata Rp70.000, jadi nilai persediaan
    // Rp1.050.000. Lima barang yang kembali pada harga pokok Rp30.000 menambah
    // Rp150.000 tanpa menggeser rata-rata secara berarti.
    const biaya = await db.query<{ average_cost: string; inventory_value: string }>(
      'select average_cost, inventory_value from product_costs where workspace_id = $1 and product_id = $2',
      [toko.workspaceId, toko.productId],
    )
    expect(Number(biaya.rows[0]!.inventory_value)).toBe(1_050_000 + 5 * 30_000)
    expect(Number(biaya.rows[0]!.average_cost)).toBeCloseTo(60_000, 3)
  })
})

describe('Pelanggan dan metode pembayaran', () => {
  it('menyimpan pelanggan dan menghitung total pembeliannya', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10, 30_000)

    const pelanggan = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/customers`,
      headers: { cookie: toko.cookie },
      payload: { name: 'Bu Sari', phone: '08123' },
    })
    expect(pelanggan.statusCode).toBe(201)
    const customerId = pelanggan.json().customerId as number

    const terjual = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      customerId,
      paymentMethodLabel: 'Tempo',
      items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-pelanggan-${sequence}`,
    })
    expect(terjual.statusCode, JSON.stringify(terjual.body)).toBe(201)

    const daftar = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/customers`,
      headers: { cookie: toko.cookie },
    })
    const isi = daftar.json().customers.find((item: { id: number }) => item.id === customerId)
    expect(isi.saleCount).toBe(1)
    expect(isi.saleTotal).toBe(45_000)
  })

  it('hanya Owner yang boleh menambah metode pembayaran (B-07)', async () => {
    const toko = await setupToko()

    const olehOwner = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/payment-methods`,
      headers: { cookie: toko.cookie },
      payload: { name: 'QRIS' },
    })
    expect(olehOwner.statusCode).toBe(201)

    const olehStaf = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/payment-methods`,
      headers: { cookie: toko.staffCookie },
      payload: { name: 'Tempo' },
    })
    expect(olehStaf.statusCode).toBe(403)
  })

  it('menolak penjualan yang memakai metode pembayaran dari daftar tetapi sudah diarsipkan', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 5, 30_000)

    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/payment-methods`,
      headers: { cookie: toko.cookie },
      payload: { name: 'Kartu Debit' },
    })
    const methodId = dibuat.json().paymentMethodId as number

    await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${toko.workspaceId}/payment-methods/${methodId}`,
      headers: { cookie: toko.cookie },
      payload: { isArchived: true },
    })

    const hasil = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodId: methodId,
      paymentMethodLabel: 'Kartu Debit',
      items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-metode-arsip-${sequence}`,
    })

    expect(hasil.statusCode).toBe(404)
    expect(hasil.body.error).toBe('metode_tidak_ditemukan')
  })
})

describe('Isolasi workspace pada penjualan', () => {
  it('menolak melihat dan membatalkan penjualan milik workspace lain', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()
    await catatMasuk(tokoA, 5, 30_000)

    const dibuat = await jual(tokoA, {
      locationId: tokoA.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: tokoA.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-isolasi-${sequence}`,
    })
    const saleId = dibuat.body.saleId as number

    const dibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${tokoB.workspaceId}/sales/${saleId}`,
      headers: { cookie: tokoB.cookie },
    })
    expect(dibaca.statusCode).toBe(404)

    const dibatalkan = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${tokoB.workspaceId}/sales/${saleId}/cancel`,
      headers: { cookie: tokoB.cookie },
      payload: {},
    })
    expect(dibatalkan.statusCode).toBe(404)

    const status = await db.query<{ status: string }>(
      'select status from sales where id = $1',
      [saleId],
    )
    expect(status.rows[0]!.status).toBe('selesai')
  })

  it('menolak produk milik workspace lain sebagai barang yang dijual', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()
    await catatMasuk(tokoB, 5, 30_000)

    const hasil = await jual(tokoB, {
      locationId: tokoB.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: tokoA.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-produk-asli-${sequence}`,
    })

    expect(hasil.statusCode).toBe(404)
    expect(hasil.body.error).toBe('produk_tidak_ditemukan')
  })
})

describe('Penjualan tidak bisa diubah setelah dibuat', () => {
  it('database menolak perubahan total penjualan yang sudah tersimpan', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 5, 30_000)

    const dibuat = await jual(toko, {
      locationId: toko.locationId,
      soldOn: '2026-10-02',
      paymentMethodLabel: 'Tunai',
      items: [{ productId: toko.productId, quantity: 1, unitPrice: 45_000 }],
      idempotencyKey: `jual-kunci-${sequence}`,
    })
    const saleId = dibuat.body.saleId as number

    await expect(
      db.query('update sales set total_amount = 1 where id = $1', [saleId]),
    ).rejects.toThrow()

    await expect(db.query('delete from sale_items where sale_id = $1', [saleId])).rejects.toThrow()
    await expect(db.query('delete from sales where id = $1', [saleId])).rejects.toThrow()
  })
})