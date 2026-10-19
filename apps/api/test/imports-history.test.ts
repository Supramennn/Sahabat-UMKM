import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { missingHeaders, parseCsv } from '../src/import/products-csv.ts'
import { missingSalesHeaders, parseSalesCsv } from '../src/import/sales-csv.ts'
import { missingSupplierHeaders, parseSupplierCsv } from '../src/import/suppliers-csv.ts'
import { missingOpeningHeaders, parseOpeningCsv } from '../src/import/opening-csv.ts'
import { readXlsx } from '../src/import/xlsx.ts'

/**
 * PRD 6.8: riwayat impor, tombol batal, dan template per jenis impor.
 *
 * Template diuji dengan validator yang sama yang membaca berkas impor. Kalau kolom
 * wajib di template berubah tanpa validator ikut berubah, tes ini yang gagal lebih
 * dulu, bukan pengguna yang berkasnya ditolak setelah diunduh dari aplikasi sendiri.
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

let sequence = 0
let passwordHash = ''

async function setupWorkspace(): Promise<{ cookie: string; workspaceId: number }> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const address = `riwayat-impor-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik Riwayat', now())
     returning id`,
    [address, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`riwayat-impor-${sequence}`, `Toko Riwayat ${sequence}`, user.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query(`insert into workspace_subscriptions (workspace_id, plan_code) values ($1, 'usaha')
    on conflict (workspace_id) do update set plan_code = 'usaha'`, [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    user.rows[0]!.id,
    'owner',
  ])

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })

  return { cookie: cookieOf(login), workspaceId }
}

async function get(
  cookie: string,
  workspaceId: number,
  path: string,
): Promise<{ statusCode: number; body: Record<string, unknown>; rawPayload: Buffer; headers: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${workspaceId}${path}`,
    headers: { cookie },
  })
  let body: Record<string, unknown> = {}
  try {
    body = response.json()
  } catch {
    body = {}
  }
  return {
    statusCode: response.statusCode,
    body,
    rawPayload: response.rawPayload,
    headers: response.headers as Record<string, unknown>,
  }
}

async function post(
  cookie: string,
  workspaceId: number,
  path: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}${path}`,
    headers: { cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('template impor (PRD 6.8)', () => {
  it('template CSV tiap jenis memuat kolom yang diterima validatornya', async () => {
    const context = await setupWorkspace()

    const produk = await get(context.cookie, context.workspaceId, '/imports/templates/produk')
    expect(produk.statusCode).toBe(200)
    expect(String(produk.headers['content-type'])).toContain('text/csv')
    expect(String(produk.headers['content-disposition'])).toContain('template-impor-produk.csv')
    expect(missingHeaders(parseCsv(produk.rawPayload.toString('utf8')).headers)).toEqual([])

    const supplier = await get(context.cookie, context.workspaceId, '/imports/templates/supplier')
    expect(supplier.statusCode).toBe(200)
    expect(missingSupplierHeaders(parseSupplierCsv(supplier.rawPayload.toString('utf8')).headers)).toEqual([])

    const saldo = await get(context.cookie, context.workspaceId, '/imports/templates/saldo_awal')
    expect(saldo.statusCode).toBe(200)
    expect(missingOpeningHeaders(parseOpeningCsv(saldo.rawPayload.toString('utf8')).headers)).toEqual([])

    const penjualan = await get(context.cookie, context.workspaceId, '/imports/templates/penjualan')
    expect(penjualan.statusCode).toBe(200)
    expect(
      missingSalesHeaders(parseSalesCsv(penjualan.rawPayload.toString('utf8')).headers),
    ).toEqual([])
  })

  it('template XLSX bisa dibaca kembali oleh pembaca berkas impor', async () => {
    const context = await setupWorkspace()
    const hasil = await get(
      context.cookie,
      context.workspaceId,
      '/imports/templates/saldo_awal?format=xlsx',
    )

    expect(hasil.statusCode).toBe(200)
    expect(String(hasil.headers['content-type'])).toContain('spreadsheetml')
    expect(hasil.rawPayload[0]).toBe(0x50)
    expect(hasil.rawPayload[1]).toBe(0x4b)

    const sheet = await readXlsx(hasil.rawPayload)
    expect(missingOpeningHeaders(sheet.headers.map((header) => header.trim()))).toEqual([])
    expect(sheet.rows.length).toBeGreaterThan(0)
  })

  it('menolak jenis template yang tidak dikenal', async () => {
    const context = await setupWorkspace()
    const hasil = await get(context.cookie, context.workspaceId, '/imports/templates/entah')

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('data_tidak_valid')
  })
})

describe('riwayat impor (PRD 6.8)', () => {
  it('menampilkan pekerjaan impor terbaru beserta pembuatnya dan jumlah barisnya', async () => {
    const context = await setupWorkspace()
    await post(context.cookie, context.workspaceId, '/imports/products', {
      content: 'sku,nama,satuan\nRIWAYAT-1,Kopi,pcs\n',
      fileName: 'produk-awal.csv',
      idempotencyKey: 'kunci-riwayat-impor-panjang',
    })

    const hasil = await get(context.cookie, context.workspaceId, '/imports')
    expect(hasil.statusCode).toBe(200)

    const jobs = hasil.body.jobs as Array<Record<string, unknown>>
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.kind).toBe('produk')
    expect(jobs[0]!.kindLabel).toBe('Impor barang')
    expect(jobs[0]!.fileName).toBe('produk-awal.csv')
    expect(jobs[0]!.importedRows).toBe(1)
    expect(jobs[0]!.status).toBe('selesai')
    expect(jobs[0]!.createdByName).toBe('Pemilik Riwayat')
    expect(jobs[0]!.cancelable).toBe(true)

    const pagination = hasil.body.pagination as Record<string, number>
    expect(pagination.total).toBe(1)
    expect(pagination.limit).toBe(20)
  })

  it('tidak menerima batas halaman di luar rentang', async () => {
    const context = await setupWorkspace()
    const hasil = await get(context.cookie, context.workspaceId, '/imports?limit=500')
    expect(hasil.statusCode).toBe(400)
  })

  it('menolak staf membaca riwayat dan mengunduh template', async () => {
    const context = await setupWorkspace()
    const staf = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, $2, 'Staf Riwayat', now())
       returning id`,
      [`staf-riwayat-${sequence}@contoh.test`, passwordHash],
    )
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      context.workspaceId,
      staf.rows[0]!.id,
      'staff',
    ])
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `staf-riwayat-${sequence}@contoh.test`, password: PASSWORD },
    })
    const cookie = cookieOf(login)

    expect((await get(cookie, context.workspaceId, '/imports')).statusCode).toBe(403)
    expect(
      (await get(cookie, context.workspaceId, '/imports/templates/produk')).statusCode,
    ).toBe(403)
  })

  it('tidak bisa membaca riwayat workspace milik orang lain', async () => {
    const pemilik = await setupWorkspace()
    const pemobi = await setupWorkspace()

    const hasil = await get(pemilik.cookie, pemobi.workspaceId, '/imports')
    expect(hasil.statusCode).toBe(403)
  })
})
