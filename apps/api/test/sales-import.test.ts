import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { parseSalesCsv, validateSalesRows, missingSalesHeaders } from '../src/import/sales-csv.ts'

/**
 * PRD 6.4: impor penjualan dari CSV dengan validasi per baris.
 * PRD 6.8: berkas divalidasi sebelum disimpan, impor berjalan penuh atau tidak sama
 * sekali, dan hasilnya bisa dibatalkan selama belum ada transaksi turunan (B-04).
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
  sku: string
}

let sequence = 0
let passwordHash = ''

async function setupToko(): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const email = `impor-jual-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik', now()) returning id`,
    [email, passwordHash],
  )
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`impor-jual-${sequence}`, `Toko Impor ${sequence}`, user.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id
  const sku = `IMP-${sequence}`

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query(`insert into workspace_subscriptions (workspace_id, plan_code) values ($1, 'usaha')
    on conflict (workspace_id) do update set plan_code = 'usaha'`, [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    user.rows[0]!.id,
    'owner',
  ])

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Kios'],
  )

  const product = await db.query<{ id: string }>(
    `insert into products (workspace_id, sku, name, unit_code, selling_price)
     values ($1, $2, 'Kopi bubuk 250 g', 'bungkus', 45000) returning id`,
    [workspaceId, sku],
  )
  const productId = Number(product.rows[0]!.id)
  await db.query('insert into product_costs (workspace_id, product_id) values ($1, $2)', [
    workspaceId,
    productId,
  ])

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  })
  return {
    cookie: cookieOf(response),
    workspaceId,
    locationId: location.rows[0]!.id,
    productId,
    sku,
  }
}

async function catatMasuk(toko: Toko, quantity: number): Promise<void> {
  await app.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.workspaceId}/stock/movements`,
    headers: { cookie: toko.cookie },
    payload: {
      productId: toko.productId,
      locationId: toko.locationId,
      kind: 'masuk',
      direction: 'tambah',
      quantity,
      unitCost: 30_000,
      reasonCode: 'pembelian',
      occurredOn: '2026-10-01',
    },
  })
}

async function imporPenjualan(
  toko: Toko,
  content: string,
  idempotencyKey: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.workspaceId}/imports/sales`,
    headers: { cookie: toko.cookie },
    payload: { content, fileName: 'penjualan.csv', idempotencyKey },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

function csvBaris(baris: string[]): string {
  return ['tanggal,lokasi,pelanggan,metode pembayaran,sku,jumlah,harga jual,diskon', ...baris].join(
    '\n',
  )
}

/** Satu baris penjualan yang valid. Caller menulis `{sku}` kalau perlu SKU khusus. */
function penjualanBaris(
  sku: string,
  tanggal: string,
  lokasi: string,
  jumlah: number,
  hargaJual: string,
  diskon = '',
): string {
  return `${tanggal},${lokasi},,Tunai,${sku},${jumlah},${hargaJual},${diskon}`
}

describe('Pembaca CSV penjualan', () => {
  it('menerima nama kolom alternatif yang biasa dipakai orang', () => {
    const parsed = parseSalesCsv(
      'Date,Location,SKU,Qty,Price\n2026-10-02,Kios,IMP-1,2,45.000\n',
    )
    expect(missingSalesHeaders(parsed.headers)).toEqual([])
    expect(parsed.rows[0]!.values.tanggal).toBe('2026-10-02')
    expect(parsed.rows[0]!.values.lokasi).toBe('Kios')
    expect(parsed.rows[0]!.values.jumlah).toBe('2')
    expect(parsed.rows[0]!.values.harga_jual).toBe('45.000')
  })

  it('melaporkan baris bermasalah dengan nomor baris dan alasannya', () => {
    const parsed = parseSalesCsv(
      csvBaris([
        '02/10/2026,Kios,,Tunai,IMP-1,2,45.000,',
        '2026-10-02,Kios,,Tunai,IMP-1,banyak,45.000,',
        '2026-10-02,Kios,,Tunai,IMP-1,2,45.000,99.000',
        '2026-10-02,, ,Tunai,IMP-1,2,45.000,',
      ]),
    )
    const hasil = validateSalesRows(parsed.rows)
    expect(hasil.valid).toHaveLength(0)
    expect(hasil.problems.map((problem) => problem.message)).toEqual([
      'Tanggal "02/10/2026" bukan format YYYY-MM-DD.',
      'Jumlah "banyak" bukan jumlah yang valid.',
      'Diskon Rp99.000 lebih besar dari nilai barang Rp90.000.',
      'Lokasi kosong.',
    ])
    expect(hasil.problems.map((problem) => problem.rowNumber)).toEqual([2, 3, 4, 5])
  })
})

describe('Impor penjualan', () => {
  it('menyimpan semua baris dalam satu transaksi dan mengurangi stok', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10)

    const hasil = await imporPenjualan(
      toko,
      csvBaris([
        penjualanBaris(toko.sku, '2026-10-02', 'Kios', 2, '45.000'),
        penjualanBaris(toko.sku, '2026-10-02', 'Kios', 1, '45.000', '5.000'),
      ]),
      `impor-sukses-${sequence}`,
    )

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(2)
    expect(hasil.body.firstNumber).toBe('INV-2026-0001')
    expect(hasil.body.lastNumber).toBe('INV-2026-0002')
    expect(hasil.body.totalAmount).toBe(90_000 + 40_000)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(7)
  })

  it('tidak menyimpan apa pun kalau satu baris bermasalah', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10)

    const hasil = await imporPenjualan(
      toko,
      csvBaris([
        penjualanBaris(toko.sku, '2026-10-02', 'Kios', 2, '45.000'),
        penjualanBaris(toko.sku, '2026-10-02', 'Tempat yang tidak ada', 1, '45.000'),
      ]),
      `impor-gagal-${sequence}`,
    )

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('impor_berhenti')

    const penjualan = await db.query('select 1 from sales where workspace_id = $1', [toko.workspaceId])
    expect(penjualan.rows).toHaveLength(0)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(10)
  })

  it('menolak berkas yang sama diimpor dua kali', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10)
    const isi = csvBaris([penjualanBaris(toko.sku, '2026-10-02', 'Kios', 1, '45.000')])

    const pertama = await imporPenjualan(toko, isi, `impor-sama-a-${sequence}`)
    expect(pertama.statusCode).toBe(201)

    const kedua = await imporPenjualan(toko, isi, `impor-sama-b-${sequence}`)
    expect(kedua.statusCode).toBe(409)
    expect(kedua.body.error).toBe('berkas_sudah_diimpor')

    const jumlah = await db.query<{ total: string }>(
      'select count(*) as total from sales where workspace_id = $1',
      [toko.workspaceId],
    )
    expect(Number(jumlah.rows[0]!.total)).toBe(1)
  })

  it('kunci idempotency yang sama mengembalikan hasil yang sama, bukan penjualan tambahan', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10)
    const isi = csvBaris([penjualanBaris(toko.sku, '2026-10-02', 'Kios', 1, '45.000')])

    const pertama = await imporPenjualan(toko, isi, `impor-ulang-${sequence}`)
    const kedua = await imporPenjualan(toko, isi, `impor-ulang-${sequence}`)

    expect(kedua.body.replayed).toBe(true)
    expect(kedua.body.importJobId).toBe(pertama.body.importJobId)

    const jumlah = await db.query<{ total: string }>(
      'select count(*) as total from sales where workspace_id = $1',
      [toko.workspaceId],
    )
    expect(Number(jumlah.rows[0]!.total)).toBe(1)
  })

  it('membatalkan hasil impor dan mengembalikan stok (B-04)', async () => {
    const toko = await setupToko()
    await catatMasuk(toko, 10)

    const hasil = await imporPenjualan(
      toko,
      csvBaris([
        penjualanBaris(toko.sku, '2026-10-02', 'Kios', 2, '45.000'),
        penjualanBaris(toko.sku, '2026-10-03', 'Kios', 3, '45.000'),
      ]),
      `impor-batal-${sequence}`,
    )
    const jobId = hasil.body.importJobId as number

    const batal = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/imports/${jobId}/cancel`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    expect(batal.statusCode).toBe(200)
    expect(batal.json().cancelled).toBe(2)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(10)

    const status = await db.query<{ status: string }>(
      'select status from sales where workspace_id = $1',
      [toko.workspaceId],
    )
    expect(status.rows.every((row) => row.status === 'dibatalkan')).toBe(true)

    // Pembatalan kedua tidak menambah stok lagi.
    const kedua = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/imports/${jobId}/cancel`,
      headers: { cookie: toko.cookie },
      payload: {},
    })
    expect(kedua.json().replayed).toBe(true)

    const saldoAkhir = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [toko.workspaceId, toko.productId, toko.locationId],
    )
    expect(Number(saldoAkhir.rows[0]!.quantity)).toBe(10)
  })

  it('pratinjau tidak menulis apa pun dan menyebut baris yang bermasalah', async () => {
    const toko = await setupToko()

    const hasil = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/imports/sales/preview`,
      headers: { cookie: toko.cookie },
      payload: {
        content: csvBaris([
          penjualanBaris(toko.sku, '2026-10-02', 'Kios', 1, '45.000'),
          penjualanBaris('TIDAK-ADA', '2026-10-02', 'Kios', 1, '45.000'),
        ]),
        idempotencyKey: `pratinjau-${sequence}`,
      },
    })

    expect(hasil.statusCode).toBe(200)
    const isi = hasil.json()
    expect(isi.totalRows).toBe(2)
    expect(isi.validRows).toBe(1)
    expect(isi.problemRows).toBe(1)
    expect(isi.problems[0].rowNumber).toBe(3)
    expect(isi.problems[0].message).toContain('TIDAK-ADA')

    const penjualan = await db.query('select 1 from sales where workspace_id = $1', [toko.workspaceId])
    expect(penjualan.rows).toHaveLength(0)
  })

  it('tidak menyentuh data workspace lain', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()
    await catatMasuk(tokoA, 10)
    await catatMasuk(tokoB, 10)

    const hasil = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${tokoA.workspaceId}/imports/sales`,
      headers: { cookie: tokoA.cookie },
      payload: {
        content: csvBaris([penjualanBaris(tokoA.sku, '2026-10-02', 'Kios', 1, '45.000')]),
        idempotencyKey: `impor-asing-${sequence}`,
      },
    })

    expect(hasil.statusCode).toBe(201)

    const penjualanB = await db.query('select 1 from sales where workspace_id = $1', [tokoB.workspaceId])
    expect(penjualanB.rows).toHaveLength(0)

    const saldoB = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where workspace_id = $1 and product_id = $2 and location_id = $3',
      [tokoB.workspaceId, tokoB.productId, tokoB.locationId],
    )
    expect(Number(saldoB.rows[0]!.quantity)).toBe(10)
  })

  it('menolak pembatalan impor milik workspace lain', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()
    await catatMasuk(tokoA, 10)

    const hasil = await imporPenjualan(
      tokoA,
      csvBaris([penjualanBaris(tokoA.sku, '2026-10-02', 'Kios', 1, '45.000')]),
      `impor-asing-batal-${sequence}`,
    )
    const jobId = hasil.body.importJobId as number

    const dibatalkan = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${tokoB.workspaceId}/imports/${jobId}/cancel`,
      headers: { cookie: tokoB.cookie },
      payload: {},
    })
    expect(dibatalkan.statusCode).toBe(404)
  })
})
