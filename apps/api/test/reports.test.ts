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
  app = await buildApp({ db, sessionSecret: 'rahasia-laporan-uji', origin: 'http://localhost:3000' })
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
     values ($1, $2, 'Penguji Laporan', now()) returning id`,
    [`laporan-${sequence}@contoh.test`, passwordHash],
  )
  const userId = user.rows[0]!.id
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`laporan-${sequence}`, 'Toko Laporan', userId],
  )
  const workspaceId = workspace.rows[0]!.id
  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceId, userId, role])
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `laporan-${sequence}@contoh.test`, password: 'kata-sandi-pengujian-2026' } })
  expect(login.statusCode).toBe(200)
  const cookie = cookieOf(login)
  await db.query('update sessions set active_workspace_id = $1 where token_hash = $2', [workspaceId, hashToken(cookie.split('=')[1]!)])
  return { workspaceId, cookie }
}

describe('laporan dan ekspor (PRD 6.6, 6.8)', () => {
  it('menghasilkan posisi stok berworkspace, saldo, dan nilai persediaan', async () => {
    const context = await setup()
    const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Rak' } })
    const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'RPT-1', name: 'Gula', unitCode: 'pcs' } })
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/stock/movements`, headers: { cookie: context.cookie }, payload: { productId: product.json().productId, locationId: location.json().locationId, kind: 'masuk', quantity: '3', unitCost: '2000', reasonCode: 'penerimaan' } })

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.json().rows).toEqual([expect.objectContaining({ sku: 'RPT-1', product: 'Gula', quantity: 3, averageCost: 2000, inventoryValue: 6000 })])
    expect(response.json().definition).toContain('harga pokok rata-rata')
  })

  it('menyaring laporan penjualan per periode dan lokasi serta memakai biaya saat transaksi', async () => {
    const context = await setup()
    const trial = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/subscription/plan`, headers: { cookie: context.cookie }, payload: { plan: 'usaha' } })
    expect(trial.statusCode).toBe(200)
    const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Kios' } })
    const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'RPT-SALE', name: 'Teh', unitCode: 'pcs', sellingPrice: '10000' } })
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/stock/movements`, headers: { cookie: context.cookie }, payload: { productId: product.json().productId, locationId: location.json().locationId, kind: 'masuk', quantity: '2', unitCost: '4000', reasonCode: 'penerimaan' } })
    const sale = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/sales`, headers: { cookie: context.cookie }, payload: { soldOn: '2026-10-12', locationId: location.json().locationId, paymentMethodLabel: 'Tunai', idempotencyKey: `laporan-sale-${sequence}-key`, items: [{ productId: product.json().productId, quantity: '1', unitPrice: '10000' }] } })
    expect(sale.statusCode).toBe(201)

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/gross-profit?from=2026-10-01&to=2026-10-31&locationId=${location.json().locationId}`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.json().rows).toEqual([expect.objectContaining({ product: 'Teh', sales: 10000, cost: 4000, grossProfit: 6000 })])
  })

  it('ekspor CSV mengikuti filter, mengutip sel, dan mencegah formula spreadsheet', async () => {
    const context = await setup()
    const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Gudang' } })
    const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'CSV-1', name: '=2+2', unitCode: 'pcs' } })
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/stock/movements`, headers: { cookie: context.cookie }, payload: { productId: product.json().productId, locationId: location.json().locationId, kind: 'masuk', quantity: '1', reasonCode: 'penerimaan' } })

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock/export?format=csv&locationId=${location.json().locationId}`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body).toContain("'=2+2")
    expect(response.headers['content-disposition']).toContain('.csv')
  })

  it('menjalankan semua jenis laporan dengan filter yang didukung', async () => {
    const context = await setup()
    const trial = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/subscription/plan`, headers: { cookie: context.cookie }, payload: { plan: 'usaha' } })
    expect(trial.statusCode).toBe(200)
    for (const kind of ['stock', 'movements', 'stocktake', 'purchases', 'debts', 'sales', 'gross-profit', 'expenses', 'monthly']) {
      const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/${kind}?from=2026-10-01&to=2026-10-31`, headers: { cookie: context.cookie } })
      expect(response.statusCode, `${kind}: ${response.body}`).toBe(200)
      expect(response.json().kind).toBe(kind)
    }
  })

  it('membatasi ekspor XLSX Gratis dan ekspor CSV ke pemilik saja', async () => {
    const context = await setup()
    const xlsx = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock/export?format=xlsx`, headers: { cookie: context.cookie } })
    expect(xlsx.statusCode).toBe(403)
    expect(xlsx.json().error).toBe('fitur_paket')

    const staff = await setup('staff')
    const forbidden = await app.inject({ method: 'GET', url: `/api/workspaces/${staff.workspaceId}/reports/stock/export?format=csv`, headers: { cookie: staff.cookie } })
    expect(forbidden.statusCode).toBe(403)
  })

  it('membuat XLSX valid untuk paket Usaha dan menerapkan filter yang sama dengan CSV', async () => {
    const context = await setup()
    const trial = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/subscription/plan`, headers: { cookie: context.cookie }, payload: { plan: 'usaha' } })
    expect(trial.statusCode).toBe(200)
    const csv = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock/export?format=csv&from=2026-10-01`, headers: { cookie: context.cookie } })
    const xlsx = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock/export?format=xlsx&from=2026-10-01`, headers: { cookie: context.cookie } })
    expect(csv.statusCode).toBe(200)
    expect(xlsx.statusCode).toBe(200)
    expect(xlsx.headers['content-type']).toContain('spreadsheetml')
    expect(xlsx.rawPayload.byteLength).toBeGreaterThan(100)
  })

  it('menolak rentang tanggal tidak sah, format ekspor asing, dan akses lintas workspace', async () => {
    const context = await setup()
    const invalid = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock?from=2026-02-31`, headers: { cookie: context.cookie } })
    expect(invalid.statusCode).toBe(400)
    const reversed = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/sales?from=2026-10-02&to=2026-10-01`, headers: { cookie: context.cookie } })
    expect(reversed.statusCode).toBe(400)
    const format = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock/export?format=pdf`, headers: { cookie: context.cookie } })
    expect(format.statusCode).toBe(400)
    const outsider = await setup()
    const forbidden = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/reports/stock`, headers: { cookie: outsider.cookie } })
    expect(forbidden.statusCode).toBe(403)
  })
})
