import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inflateRawSync } from 'node:zlib'
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
  app = await buildApp({ db, sessionSecret: 'rahasia-ekspor-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

/**
 * Pembaca ZIP sederhana untuk pengujian: membaca central directory, lalu
 * membuka tiap entri lewat local header-nya. Ini memastikan arsip yang dibuat
 * penulis ZIP sendiri benar-benar bisa dibaca alat lain, bukan hanya terlihat
 * benar dari luar.
 */
function readZip(buffer: Buffer): Map<string, string> {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1
  expect(end, 'end of central directory tidak ditemukan').toBeGreaterThanOrEqual(0)

  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const entries = new Map<string, string>()

  for (let index = 0; index < count; index += 1) {
    expect(buffer.readUInt32LE(offset), 'central directory rusak').toBe(0x02014b50)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(start, start + compressedSize)
    const data = method === 8 ? inflateRawSync(compressed) : compressed
    entries.set(name, data.toString('utf8'))

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

async function setup(role = 'owner') {
  sequence += 1
  passwordHash ||= await hashPassword('kata-sandi-pengujian-2026')
  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Penguji Ekspor', now()) returning id`,
    [`ekspor-${sequence}@contoh.test`, passwordHash],
  )
  const userId = user.rows[0]!.id
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`ekspor-${sequence}`, 'Toko Ekspor', userId],
  )
  const workspaceId = workspace.rows[0]!.id
  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceId, userId, role])
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `ekspor-${sequence}@contoh.test`, password: 'kata-sandi-pengujian-2026' } })
  expect(login.statusCode).toBe(200)
  const cookie = cookieOf(login)
  await db.query('update sessions set active_workspace_id = $1 where token_hash = $2', [workspaceId, hashToken(cookie.split('=')[1]!)])
  return { workspaceId, cookie }
}

describe('ekspor seluruh data workspace (PRD 6.8)', () => {
  it('menghasilkan arsip ZIP berisi CSV tiap tabel dengan id yang saling merujuk', async () => {
    const context = await setup()
    const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Gudang Utama' } })
    const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'EXP-1', name: 'Kopi Bubuk', unitCode: 'pcs', sellingPrice: '15000' } })
    const productId = product.json().productId as number
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/stock/movements`, headers: { cookie: context.cookie }, payload: { productId, locationId: location.json().locationId, kind: 'masuk', quantity: '2.5', unitCost: '4000', reasonCode: 'penerimaan' } })

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/exports/workspace`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/zip')
    expect(response.headers['content-disposition']).toContain(`sahabat-umkm-ekspor-${sequence}-`)

    const entries = readZip(response.rawPayload)
    expect([...entries.keys()]).toContain('PANDUAN.txt')
    expect([...entries.keys()]).toContain('produk.csv')
    expect(entries.size).toBe(29)

    const products = entries.get('produk.csv')!
    expect(products).toContain('"Kopi Bubuk"')
    expect(products).toContain(`"${productId}"`)

    const movements = entries.get('pergerakan-stok.csv')!
    expect(movements).toContain(`"${productId}"`)
    expect(movements).toContain('"2.5"')
    expect(movements).toContain('"4000"')

    const balances = entries.get('saldo-stok.csv')!
    expect(balances).toContain('"2.5"')
  })

  it('memakai aturan CSV yang sama: sel dikutip dan rumus tidak dijalankan', async () => {
    const context = await setup()
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'EXP-2', name: '=2+2', unitCode: 'pcs' } })
    await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'EXP-3', name: '-Toko Cabang', unitCode: 'pcs' } })

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/exports/workspace`, headers: { cookie: context.cookie } })
    const products = readZip(response.rawPayload).get('produk.csv')!
    expect(products).toContain('"\'=2+2"')
    expect(products).toContain('"\'-Toko Cabang"')
    expect(products.startsWith('\uFEFF')).toBe(true)
  })

  it('mencatat ekspor ke audit log tanpa isi berkas', async () => {
    const context = await setup()
    const before = await db.query<{ count: string }>('select count(*)::text as count from audit_logs where workspace_id = $1 and action = $2', [context.workspaceId, 'data.export'])
    expect(Number(before.rows[0]!.count)).toBe(0)

    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/exports/workspace`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)

    const after = await db.query<{ result: string; actor_role: string; metadata: { cakupan?: string } }>(
      'select result, actor_role, metadata from audit_logs where workspace_id = $1 and action = $2',
      [context.workspaceId, 'data.export'],
    )
    expect(after.rows).toHaveLength(1)
    expect(after.rows[0]).toMatchObject({ result: 'success', actor_role: 'owner' })
    expect(after.rows[0]!.metadata.cakupan).toBe('seluruh_data')
  })

  it('menolak peran yang tidak punya izin ekspor penuh dan workspace lain', async () => {
    const staff = await setup('staff')
    const denied = await app.inject({ method: 'GET', url: `/api/workspaces/${staff.workspaceId}/exports/workspace`, headers: { cookie: staff.cookie } })
    expect(denied.statusCode).toBe(403)

    const outsider = await setup('owner')
    const crossWorkspace = await app.inject({ method: 'GET', url: `/api/workspaces/${staff.workspaceId}/exports/workspace`, headers: { cookie: outsider.cookie } })
    expect(crossWorkspace.statusCode).toBe(403)
  })

  it('menolak permintaan tanpa sesi', async () => {
    const context = await setup()
    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/exports/workspace` })
    expect(response.statusCode).toBe(401)
  })
})
