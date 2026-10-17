import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { hashPassword } from '../src/auth/password.ts'
import { hashToken } from '../src/auth/token.ts'
import { cookieOf } from './account-helpers.ts'

let db: Database
let app: FastifyInstance
let sequence = 0
let passwordHash = ''

beforeAll(async () => {
  db = await createTestDatabase()
  app = await buildApp({ db, sessionSecret: 'rahasia-dashboard-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

async function setup(role = 'owner') {
  sequence += 1
  passwordHash ||= await hashPassword('kata-sandi-pengujian-2026')
  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Penguji Dashboard', now()) returning id`,
    [`dashboard-${sequence}@contoh.test`, passwordHash],
  )
  const userId = user.rows[0]!.id
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`dashboard-${sequence}`, 'Toko Dashboard', userId],
  )
  const workspaceId = workspace.rows[0]!.id
  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceId, userId, role])
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `dashboard-${sequence}@contoh.test`, password: 'kata-sandi-pengujian-2026' } })
  expect(login.statusCode).toBe(200)
  const cookie = cookieOf(login)
  await db.query('update sessions set active_workspace_id = $1 where token_hash = $2', [workspaceId, hashToken(cookie.split('=')[1]!)])
  return { workspaceId, cookie }
}

const hariJakarta = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

function tanggalMundur(days: number): string {
  return new Date(Date.parse(`${hariJakarta()}T00:00:00.000Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

async function siapkanData(context: { workspaceId: number; cookie: string }) {
  const bukaFitur = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/subscription/plan`, headers: { cookie: context.cookie }, payload: { plan: 'usaha' } })
  expect(bukaFitur.statusCode).toBe(200)

  const supplier = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/suppliers`, headers: { cookie: context.cookie }, payload: { name: 'CV Sumber Rejeki', paymentTermDays: 7 } })
  const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Gudang Dashboard' } })
  const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'DASH-1', name: 'Kopi Bubuk', unitCode: 'pcs', minStock: '5' } })
  const supplierId = supplier.json().supplierId as number
  const locationId = location.json().locationId as number
  const productId = product.json().productId as number

  // PO pertama diterima penuh sepuluh hari lalu supaya utangnya sudah lewat
  // termin tujuh hari dan muncul sebagai jatuh tempo.
  const order = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/purchase-orders`, headers: { cookie: context.cookie }, payload: { supplierId, locationId, orderedOn: tanggalMundur(10), items: [{ productId, quantity: '4', unitPrice: '2500' }] } })
  const orderId = order.json().orderId as number
  expect((await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/purchase-orders/${orderId}/submit`, headers: { cookie: context.cookie }, payload: {} })).statusCode).toBe(200)
  expect((await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/purchase-orders/${orderId}/approve`, headers: { cookie: context.cookie }, payload: {} })).statusCode).toBe(200)
  const receipt = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/goods-receipts`, headers: { cookie: context.cookie }, payload: { purchaseOrderId: orderId, receivedOn: tanggalMundur(10), items: [{ productId, quantity: '4' }], idempotencyKey: `dashboard-terima-${sequence}-kunci` } })
  expect(receipt.statusCode, receipt.body).toBe(201)

  // PO kedua dibiarkan menunggu persetujuan supaya kartu dan daftar tindakan
  // punya satu baris nyata.
  const menunggu = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/purchase-orders`, headers: { cookie: context.cookie }, payload: { supplierId, locationId, items: [{ productId, quantity: '2', unitPrice: '3000' }] } })
  const menungguId = menunggu.json().orderId as number
  expect((await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/purchase-orders/${menungguId}/submit`, headers: { cookie: context.cookie }, payload: {} })).statusCode).toBe(200)

  const sale = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/sales`, headers: { cookie: context.cookie }, payload: { locationId, paymentMethodLabel: 'Tunai', items: [{ productId, quantity: '2', unitPrice: '15000' }], idempotencyKey: `dashboard-jual-${sequence}-kunci` } })
  expect(sale.statusCode, sale.body).toBe(201)

  return { supplierId, locationId, productId, orderId, menungguId }
}

describe('dashboard (PRD 6.7)', () => {
  it('workspace baru menampilkan nol dan daftar kosong, bukan angka contoh', async () => {
    const context = await setup()
    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(body.from).toBe(`${hariJakarta().slice(0, 7)}-01`)
    expect(body.to).toBe(hariJakarta())
    expect(body.cards.map((card: { key: string }) => card.key)).toEqual(['produk-aktif', 'stok-rendah', 'po-belum-selesai', 'penjualan-periode', 'pembelian-periode'])
    for (const card of body.cards) expect(card.value).toBe(0)

    expect(body.stockStatus.summary).toContain('Belum ada produk aktif')
    expect(body.stockStatus.rows).toEqual([])
    for (const action of body.actions) expect(action.items).toEqual([])
    for (const trend of body.trends) expect(trend.points.every((point: { value: number }) => point.value === 0)).toBe(true)
  })

  it('menghitung kartu, tren, dan daftar tindakan dari data nyata', async () => {
    const context = await setup()
    const data = await siapkanData(context)

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard?from=${tanggalMundur(20)}&to=${hariJakarta()}`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    const nilai = (key: string) => body.cards.find((card: { key: string }) => card.key === key)?.value

    expect(body.access).toEqual({ stock: true, sales: true, purchasing: true, debts: true })
    expect(nilai('produk-aktif')).toBe(1)
    expect(nilai('stok-rendah')).toBe(1)
    expect(nilai('po-belum-selesai')).toBe(1)
    expect(nilai('penjualan-periode')).toBe(30000)
    expect(nilai('pembelian-periode')).toBe(10000)
    expect(nilai('utang-jatuh-tempo')).toBe(10000)

    expect(body.stockStatus.rows).toEqual([
      { status: 'habis', label: 'Habis', count: 0 },
      { status: 'stok_rendah', label: 'Stok rendah', count: 1 },
      { status: 'normal', label: 'Normal', count: 0 },
    ])

    const tren = (key: string) => body.trends.find((item: { key: string }) => item.key === key)
    expect(tren('penjualan-periode').summary).toContain('Rp')
    expect(tren('penjualan-periode').points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)).toBe(30000)
    expect(tren('stok-masuk').points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)).toBe(4)
    expect(tren('stok-keluar').points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)).toBe(2)

    const aksi = (key: string) => body.actions.find((item: { key: string }) => item.key === key)
    expect(aksi('perlu-dibeli').items).toHaveLength(1)
    expect(aksi('perlu-dibeli').items[0].label).toContain('Kopi Bubuk')
    expect(aksi('po-menunggu').items).toHaveLength(1)
    expect(aksi('po-menunggu').items[0].href).toBe(`/pembelian/po/${data.menungguId}`)
    expect(aksi('utang-jatuh-tempo').items).toHaveLength(1)
    // Selisih hari terhadap current_date bisa berbeda satu hari antara zona
    // waktu Jakarta dan UTC, jadi rentang 2-3 hari yang diperiksa.
    const lewat = Number(/lewat (\d+) hari/.exec(aksi('utang-jatuh-tempo').items[0].detail)?.[1])
    expect(lewat).toBeGreaterThanOrEqual(2)
    expect(lewat).toBeLessThanOrEqual(3)
  })

  it('menyaring periode dan lokasi tanpa mengubah kartu stok saat ini', async () => {
    const context = await setup()
    await siapkanData(context)

    const kosong = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard?from=2020-01-01&to=2020-01-31`, headers: { cookie: context.cookie } })
    const bodyKosong = kosong.json()
    const nilai = (body: { cards: Array<{ key: string; value: number }> }, key: string) => body.cards.find((card) => card.key === key)?.value
    expect(nilai(bodyKosong, 'penjualan-periode')).toBe(0)
    expect(nilai(bodyKosong, 'pembelian-periode')).toBe(0)
    // Posisi stok tidak terikat periode, jadi kartunya tetap berisi.
    expect(nilai(bodyKosong, 'produk-aktif')).toBe(1)
    expect(nilai(bodyKosong, 'stok-rendah')).toBe(1)

    const lokasiLain = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Gudang Kedua' } })
    expect(lokasiLain.statusCode).toBe(201)
    const disaring = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard?locationId=${lokasiLain.json().locationId}`, headers: { cookie: context.cookie } })
    const bodyDisaring = disaring.json()
    expect(bodyDisaring.locationId).toBe(lokasiLain.json().locationId)
    expect(nilai(bodyDisaring, 'penjualan-periode')).toBe(0)
    const keluar = bodyDisaring.trends.find((item: { key: string }) => item.key === 'stok-keluar')
    expect(keluar.summary).toContain('Belum ada stok keluar')
    // Di lokasi tanpa saldo, barang aktif tetap dihitung habis.
    expect(nilai(bodyDisaring, 'stok-rendah')).toBe(1)
    expect(bodyDisaring.stockStatus.rows.find((row: { status: string }) => row.status === 'habis').count).toBe(1)
  })

  it('menyembunyikan bagian keuangan dari Viewer dan memblokir laporan dari Staf', async () => {
    const viewerContext = await setup('viewer')
    const viewer = await app.inject({ method: 'GET', url: `/api/workspaces/${viewerContext.workspaceId}/dashboard`, headers: { cookie: viewerContext.cookie } })
    expect(viewer.statusCode).toBe(200)
    const body = viewer.json()
    expect(body.access).toEqual({ stock: true, sales: true, purchasing: false, debts: false })
    expect(body.cards.map((card: { key: string }) => card.key)).toEqual(['produk-aktif', 'stok-rendah', 'penjualan-periode'])
    expect(body.trends.map((trend: { key: string }) => trend.key)).toEqual(['penjualan-periode', 'stok-masuk', 'stok-keluar'])
    expect(body.actions.map((action: { key: string }) => action.key)).toEqual(['perlu-dibeli', 'hampir-kedaluwarsa'])

    const staffContext = await setup('staff')
    const staff = await app.inject({ method: 'GET', url: `/api/workspaces/${staffContext.workspaceId}/dashboard`, headers: { cookie: staffContext.cookie } })
    expect(staff.statusCode).toBe(200)
    const staffBody = staff.json()
    expect(staffBody.access).toEqual({ stock: false, sales: false, purchasing: false, debts: false })
    expect(staffBody.cards).toEqual([])
    expect(staffBody.trends).toEqual([])
    expect(staffBody.stockStatus).toBeNull()
    expect(staffBody.actions).toEqual([])
  })

  it('menyembunyikan utang supplier di paket Gratis walau perannya Owner', async () => {
    const context = await setup()
    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard`, headers: { cookie: context.cookie } })
    const body = response.json()
    expect(body.access.debts).toBe(false)
    expect(body.cards.map((card: { key: string }) => card.key)).not.toContain('utang-jatuh-tempo')
    expect(body.actions.map((action: { key: string }) => action.key)).not.toContain('utang-jatuh-tempo')
  })

  it('menolak tanggal yang tidak valid, sesi tanpa masuk, dan workspace lain', async () => {
    const context = await setup()
    const invalid = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard?from=2026-02-31`, headers: { cookie: context.cookie } })
    expect(invalid.statusCode).toBe(400)

    const terbalik = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard?from=2026-10-10&to=2026-10-01`, headers: { cookie: context.cookie } })
    expect(terbalik.statusCode).toBe(400)

    const tanpaSesi = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard` })
    expect(tanpaSesi.statusCode).toBe(401)

    const outsider = await setup()
    const lintasWorkspace = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/dashboard`, headers: { cookie: outsider.cookie } })
    expect(lintasWorkspace.statusCode).toBe(403)
  })
})
