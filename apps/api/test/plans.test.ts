import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import { registerVerifyAndLogin, type CapturedEmail } from './account-helpers.ts'

let db: Database
let app: FastifyInstance
let email: CapturedEmail
let seq = 0

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

async function workspace(): Promise<{ id: number; cookie: string }> {
  seq += 1
  const address = `paket-${seq}@contoh.test`
  const cookie = await registerVerifyAndLogin(app, email, address)
  const created = await app.inject({
    method: 'POST', url: '/api/workspaces', headers: { cookie },
    payload: { name: `Toko Paket ${seq}`, timezone: 'Asia/Jakarta' },
  })
  expect(created.statusCode).toBe(201)
  return { id: created.json().workspaceId as number, cookie }
}

describe('Paket workspace dan masa uji coba (PRD 6.10, 16)', () => {
  it('membuat workspace baru pada paket Gratis dan mengembalikan katalog usulan', async () => {
    const toko = await workspace()
    const response = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().subscription.plan).toBe('gratis')
    expect(response.json().plans).toHaveLength(3)
    expect(response.json().pricingNote).toContain('belum ditetapkan')
    expect(response.json().billingEnabled).toBe(false)
  })

  it('Owner dapat memulai satu masa uji coba 14 hari tanpa kartu', async () => {
    const toko = await workspace()
    const started = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'usaha' },
    })
    expect(started.statusCode).toBe(200)
    expect(started.json().subscription).toMatchObject({ plan: 'usaha', status: 'uji_coba' })
    expect(started.json().billingEnabled).toBe(false)

    const trial = await db.query<{ trial_started_at: Date; trial_ends_at: Date; trial_used_at: Date }>(
      'select trial_started_at, trial_ends_at, trial_used_at from workspace_subscriptions where workspace_id = $1',
      [toko.id],
    )
    expect(trial.rows[0]!.trial_ends_at.getTime() - trial.rows[0]!.trial_started_at.getTime()).toBe(14 * 24 * 60 * 60 * 1000)
    expect(trial.rows[0]!.trial_used_at).toBeTruthy()

    const second = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'bisnis' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('menurunkan uji coba yang kedaluwarsa ke Gratis tanpa menghapus riwayat pemakaian', async () => {
    const toko = await workspace()
    await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'usaha' },
    })
    await db.query(
      `update workspace_subscriptions set trial_ends_at = now() - interval '1 second' where workspace_id = $1`,
      [toko.id],
    )
    const response = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().subscription).toMatchObject({ plan: 'gratis', status: 'aktif', trialUsed: true })
  })

  it('menolak paket yang tidak dikenal tanpa mengubah langganan', async () => {
    const toko = await workspace()
    const response = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'enterprise' },
    })
    expect(response.statusCode).toBe(400)
    const row = await db.query<{ plan_code: string }>(
      'select plan_code from workspace_subscriptions where workspace_id = $1', [toko.id],
    )
    expect(row.rows[0]!.plan_code).toBe('gratis')
  })

  it('mengunci fitur Gratis di server, termasuk membaca saldo utang', async () => {
    const toko = await workspace()
    const supplier = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/suppliers`, headers: { cookie: toko.cookie },
      payload: { name: 'Supplier Uji' },
    })
    expect(supplier.statusCode).toBe(201)
    const debts = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/supplier-debts`, headers: { cookie: toko.cookie },
    })
    expect(debts.statusCode).toBe(403)
    expect(debts.json().error).toBe('fitur_paket')

    const payment = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/supplier-payments`, headers: { cookie: toko.cookie },
      payload: { supplierId: supplier.json().supplierId, amount: '1000', method: 'Tunai' },
    })
    expect(payment.statusCode).toBe(403)
    expect(payment.json().error).toBe('fitur_paket')

    const location = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/locations`, headers: { cookie: toko.cookie },
      payload: { name: 'Gudang' },
    })
    expect(location.statusCode).toBe(201)
    const count = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/stock/counts`, headers: { cookie: toko.cookie },
      payload: { locationId: location.json().locationId },
    })
    expect(count.statusCode).toBe(403)
    expect(count.json().error).toBe('fitur_paket')
  })

  it('tetap mengunci pengisian sesi opname yang dibuat sebelum downgrade', async () => {
    const toko = await workspace()
    const started = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'usaha' },
    })
    expect(started.statusCode).toBe(200)
    const location = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/locations`, headers: { cookie: toko.cookie },
      payload: { name: 'Gudang' },
    })
    const product = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/products`, headers: { cookie: toko.cookie },
      payload: { sku: 'OPNAME-1', name: 'Barang Uji', unitCode: 'pcs' },
    })
    const count = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/stock/counts`, headers: { cookie: toko.cookie },
      payload: { locationId: location.json().locationId },
    })
    expect(count.statusCode).toBe(201)

    const downgrade = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'gratis' },
    })
    expect(downgrade.statusCode).toBe(200)
    const fill = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${toko.id}/stock/counts/${count.json().countId}/items/${product.json().productId}`,
      headers: { cookie: toko.cookie }, payload: { countedQuantity: '1' },
    })
    expect(fill.statusCode).toBe(403)
    expect(fill.json().error).toBe('fitur_paket')
  })

  it('membatasi kelola paket ke Owner dan menolak akses lintas workspace', async () => {
    const toko = await workspace()
    const outsiderAddress = `luar-${seq}@contoh.test`
    const outsider = await registerVerifyAndLogin(app, email, outsiderAddress)
    const forbidden = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: outsider },
      payload: { plan: 'usaha' },
    })
    expect(forbidden.statusCode).toBe(403)
  })
})
