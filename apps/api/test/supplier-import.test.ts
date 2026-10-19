import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { parseSupplierCsv, validateSupplierRows } from '../src/import/suppliers-csv.ts'

/**
 * PRD 6.8: impor supplier dari CSV atau XLSX dengan pratinjau, impor berjalan penuh
 * atau tidak sama sekali, dan hasilnya bisa dibatalkan selama suppliernya belum
 * dipakai dokumen pembelian (B-04).
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
  const address = `supplier-impor-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik Supplier', now())
     returning id`,
    [address, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`supplier-impor-${sequence}`, `Toko Supplier ${sequence}`, user.rows[0]!.id],
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

async function post(
  context: { cookie: string; workspaceId: number },
  path: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}${path}`,
    headers: { cookie: context.cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

async function get(
  context: { cookie: string; workspaceId: number },
  path: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${context.workspaceId}${path}`,
    headers: { cookie: context.cookie },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('memvalidasi baris supplier (PRD 6.8)', () => {
  it('menerima nama saja, tanpa kolom lain', () => {
    const parsed = parseSupplierCsv('nama\nToko Sumber\n')
    const validation = validateSupplierRows(parsed.rows)

    expect(validation.valid).toHaveLength(1)
    expect(validation.problems).toHaveLength(0)
    expect(validation.valid[0]!.paymentTermDays).toBeNull()
  })

  it('menandai nama yang muncul dua kali', () => {
    const parsed = parseSupplierCsv('nama,termin\nToko Sumber,30\nToko Sumber,45\n')
    const validation = validateSupplierRows(parsed.rows)

    expect(validation.valid).toHaveLength(1)
    expect(validation.problems).toHaveLength(1)
    expect(validation.problems[0]!.message).toContain('baris 2')
  })

  it('menolak termin yang bukan angka hari', () => {
    const parsed = parseSupplierCsv('nama,termin\nToko Sumber,abc\n')
    const validation = validateSupplierRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems[0]!.message).toContain('Termin')
  })

  it('membaca termin dengan kata hari dan email yang wajar', () => {
    const parsed = parseSupplierCsv('nama,termin,email\nToko Sumber,30 hari,belanja@sumber.co.id\n')
    const validation = validateSupplierRows(parsed.rows)

    expect(validation.valid[0]!.paymentTermDays).toBe(30)
    expect(validation.valid[0]!.email).toBe('belanja@sumber.co.id')
  })

  it('menolak email yang jelas bukan email', () => {
    const parsed = parseSupplierCsv('nama,email\nToko Sumber,belanja-sumber\n')
    const validation = validateSupplierRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems[0]!.message).toContain('Email')
  })
})

describe('pratinjau dan simpan impor supplier (PRD 6.8)', () => {
  it('melaporkan baris bermasalah tanpa menyimpan apa pun', async () => {
    const context = await setupWorkspace()
    const preview = await post(context, '/imports/suppliers/preview', {
      content: 'nama,email\nToko A,email-salah\n',
      idempotencyKey: 'kunci-pratinjau-supplier-panjang',
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.body.validRows).toBe(0)
    expect(preview.body.problemRows).toBe(1)

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from suppliers where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(0)
  })

  it('menyimpan baris valid beserta kontak dan termin, dan mencatat pekerjaannya', async () => {
    const context = await setupWorkspace()
    const content = [
      'nama,kontak,telepon,email,alamat,termin,catatan',
      'PT Sumber Kopi,Rina,0811111111,rina@sumberkopi.co.id,Jl. Merdeka 10,30,Kirim pagi',
      'Toko Gula Jaya,Budi,,,,,Kirim setiap Senin',
    ].join('\n')

    const hasil = await post(context, '/imports/suppliers', {
      content,
      fileName: 'supplier.csv',
      idempotencyKey: 'kunci-simpan-supplier-panjang',
    })

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(2)

    const supplier = await db.query<{ name: string; contact_name: string; payment_term_days: number | null }>(
      'select name, contact_name, payment_term_days from suppliers where workspace_id = $1 order by name',
      [context.workspaceId],
    )
    expect(supplier.rows.map((row) => row.name)).toEqual(['PT Sumber Kopi', 'Toko Gula Jaya'])
    expect(supplier.rows[0]!.contact_name).toBe('Rina')
    expect(supplier.rows[0]!.payment_term_days).toBe(30)

    const job = await db.query<{ kind: string; imported_rows: number; total_rows: number }>(
      'select kind, imported_rows, total_rows from import_jobs where workspace_id = $1',
      [context.workspaceId],
    )
    expect(job.rows[0]!.kind).toBe('supplier')
    expect(job.rows[0]!.imported_rows).toBe(2)
    expect(job.rows[0]!.total_rows).toBe(2)
  })

  it('melewati supplier yang sudah ada tanpa menimpanya', async () => {
    const context = await setupWorkspace()
    await post(context, '/imports/suppliers', {
      content: 'nama\nToko Gula Jaya\n',
      idempotencyKey: 'kunci-supplier-awal-panjang',
    })

    const hasil = await post(context, '/imports/suppliers', {
      content: 'nama\nToko Gula Jaya\nPT Sumber Kopi\n',
      idempotencyKey: 'kunci-supplier-ulang-panjang',
    })

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(1)
    expect(hasil.body.skipped).toBe(1)
    expect(String((hasil.body.skippedRows as Array<{ message: string }>)[0]!.message)).toContain(
      'sudah ada',
    )
  })

  it('menolak impor dari peran yang tidak berizin', async () => {
    const context = await setupWorkspace()
    const staf = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, $2, 'Staf Supplier', now())
       returning id`,
      [`staf-supplier-${sequence}@contoh.test`, passwordHash],
    )
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      context.workspaceId,
      staf.rows[0]!.id,
      'staff',
    ])
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `staf-supplier-${sequence}@contoh.test`, password: PASSWORD },
    })

    const hasil = await post(
      { ...context, cookie: cookieOf(login) },
      '/imports/suppliers',
      { content: 'nama\nToko Staf\n', idempotencyKey: 'kunci-supplier-staf-panjang' },
    )

    expect(hasil.statusCode).toBe(403)
  })
})

describe('pembatalan impor supplier (B-04)', () => {
  it('membatalkan impor selama suppliernya belum dipakai', async () => {
    const context = await setupWorkspace()
    const commit = await post(context, '/imports/suppliers', {
      content: 'nama\nToko Batal\n',
      idempotencyKey: 'kunci-supplier-batal-panjang',
    })
    expect(commit.statusCode).toBe(201)
    const jobId = commit.body.importJobId as number

    const batal = await post(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(200)
    expect(batal.body.cancelled).toBe(1)

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from suppliers where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(0)
  })

  it('tidak bisa dibatalkan setelah suppliernya dipakai PO', async () => {
    const context = await setupWorkspace()
    const commit = await post(context, '/imports/suppliers', {
      content: 'nama\nToko Dipakai\n',
      idempotencyKey: 'kunci-supplier-dipakai-panjang',
    })
    expect(commit.statusCode).toBe(201)
    const jobId = commit.body.importJobId as number

    const supplier = await db.query<{ id: number }>(
      "select id from suppliers where workspace_id = $1 and name = 'Toko Dipakai'",
      [context.workspaceId],
    )
    const location = await db.query<{ id: number }>(
      'insert into locations (workspace_id, name) values ($1, $2) returning id',
      [context.workspaceId, 'Gudang'],
    )
    const product = await db.query<{ id: number }>(
      `insert into products (workspace_id, sku, name, unit_code)
       values ($1, 'PO-1', 'Beras', 'pcs') returning id`,
      [context.workspaceId],
    )

    const po = await post(context, '/purchase-orders', {
      supplierId: supplier.rows[0]!.id,
      locationId: location.rows[0]!.id,
      items: [{ productId: product.rows[0]!.id, quantity: '10', unitPrice: '60000' }],
    })
    expect(po.statusCode).toBe(201)

    const riwayat = await get(context, '/imports')
    const job = (riwayat.body.jobs as Array<{ id: number; cancelable: boolean; cancelBlockedReason: string }>).find(
      (item) => item.id === jobId,
    )
    expect(job?.cancelable).toBe(false)
    expect(String(job?.cancelBlockedReason)).toContain('dipakai transaksi')

    const batal = await post(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(409)
    expect(batal.body.error).toBe('impor_tidak_bisa_dibatalkan')

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from suppliers where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(1)
  })
})
