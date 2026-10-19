import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { parseOpeningCsv, validateOpeningRows } from '../src/import/opening-csv.ts'

/**
 * PRD 6.8: impor saldo awal dari CSV atau XLSX. Saldo awal menghasilkan baris ledger
 * stok, jadi pembatalannya membuat baris pembalik, bukan menghapus ledger (B-04).
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

interface Toko {
  cookie: string
  workspaceId: number
  locationId: number
  productId: number
}

async function setupToko(): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const address = `saldo-awal-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik Saldo', now())
     returning id`,
    [address, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`saldo-awal-${sequence}`, `Toko Saldo ${sequence}`, user.rows[0]!.id],
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

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Gudang'],
  )
  const product = await db.query<{ id: number }>(
    `insert into products (workspace_id, sku, name, unit_code)
     values ($1, 'BR-1', 'Beras 5 kg', 'karung') returning id`,
    [workspaceId],
  )

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })

  return {
    cookie: cookieOf(login),
    workspaceId,
    locationId: location.rows[0]!.id,
    productId: product.rows[0]!.id,
  }
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

async function saldo(context: Toko): Promise<number> {
  const found = await db.query<{ quantity: string }>(
    `select quantity from stock_balances
      where workspace_id = $1 and product_id = $2 and location_id = $3`,
    [context.workspaceId, context.productId, context.locationId],
  )
  return found.rows[0] ? Number(found.rows[0].quantity) : 0
}

async function jumlahGerak(context: { workspaceId: number }): Promise<number> {
  const found = await db.query<{ count: number }>(
    'select count(*)::int as count from stock_movements where workspace_id = $1',
    [context.workspaceId],
  )
  return found.rows[0]!.count
}

describe('memvalidasi baris saldo awal (PRD 6.8)', () => {
  it('menolak jumlah nol atau negatif', () => {
    const parsed = parseOpeningCsv('sku,lokasi,jumlah\nBR-1,Gudang,0\nBR-1,Gudang,-2\n')
    const validation = validateOpeningRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems).toHaveLength(2)
    expect(validation.problems[0]!.message).toContain('lebih besar dari nol')
  })

  it('menandai barang yang sama muncul dua kali di lokasi yang sama', () => {
    const parsed = parseOpeningCsv('sku,lokasi,jumlah\nBR-1,Gudang,5\nBR-1,gudang,3\n')
    const validation = validateOpeningRows(parsed.rows)

    expect(validation.valid).toHaveLength(1)
    expect(validation.problems[0]!.message).toContain('baris 2')
  })

  it('membaca rupiah harga beli dan tanggal', () => {
    const parsed = parseOpeningCsv(
      'sku,lokasi,jumlah,harga beli,tanggal\nBR-1,Gudang,1500,"Rp 12.500",2026-01-31\n',
    )
    const validation = validateOpeningRows(parsed.rows)

    expect(validation.valid[0]!.quantity).toBe(1500)
    expect(validation.valid[0]!.unitCost).toBe(12500)
    expect(validation.valid[0]!.occurredOn).toBe('2026-01-31')
  })

  it('menolak tanggal yang formatnya bukan YYYY-MM-DD', () => {
    const parsed = parseOpeningCsv('sku,lokasi,jumlah,tanggal\nBR-1,Gudang,5,31/01/2026\n')
    const validation = validateOpeningRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems[0]!.message).toContain('YYYY-MM-DD')
  })
})

describe('pratinjau dan simpan saldo awal (PRD 6.8)', () => {
  it('melaporkan SKU dan lokasi yang tidak dikenal tanpa menyimpan', async () => {
    const context = await setupToko()
    const preview = await post(context, '/imports/opening-balances/preview', {
      content: 'sku,lokasi,jumlah\nTIDAK-ADA,Gudang,5\nBR-1,Tidak Ada,5\n',
      idempotencyKey: 'kunci-pratinjau-saldo-panjang',
    })

    expect(preview.statusCode).toBe(200)
    expect(preview.body.validRows).toBe(0)
    expect(preview.body.problemRows).toBe(2)

    expect(await jumlahGerak(context)).toBe(0)
  })

  it('menyimpan saldo awal sebagai transaksi stok masuk beralasan saldo_awal', async () => {
    const context = await setupToko()
    const hasil = await post(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah,harga beli\nBR-1,Gudang,24,45000\n',
      fileName: 'saldo-awal.csv',
      idempotencyKey: 'kunci-simpan-saldo-panjang',
    })

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(1)
    expect(hasil.body.totalQuantity).toBe(24)

    expect(await saldo(context)).toBe(24)

    const gerak = await db.query<{ kind: string; reason_code: string }>(
      'select kind, reason_code from stock_movements where workspace_id = $1',
      [context.workspaceId],
    )
    expect(gerak.rows[0]!.kind).toBe('masuk')
    expect(gerak.rows[0]!.reason_code).toBe('saldo_awal')

    const biaya = await db.query<{ average_cost: string }>(
      'select average_cost from product_costs where workspace_id = $1 and product_id = $2',
      [context.workspaceId, context.productId],
    )
    expect(Number(biaya.rows[0]!.average_cost)).toBe(45000)

    const job = await db.query<{ kind: string; imported_rows: number }>(
      'select kind, imported_rows from import_jobs where workspace_id = $1',
      [context.workspaceId],
    )
    expect(job.rows[0]!.kind).toBe('saldo_awal')
    expect(job.rows[0]!.imported_rows).toBe(1)
  })

  it('menjalankan atau tidak sama sekali saat ada baris bermasalah', async () => {
    const context = await setupToko()
    const hasil = await post(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah\nBR-1,Gudang,5\nBR-1,Gudang,7\n',
      idempotencyKey: 'kunci-saldo-setengah-panjang',
    })

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('impor_berhenti')
    expect(await jumlahGerak(context)).toBe(0)
    expect(await saldo(context)).toBe(0)
  })
})

describe('pembatalan impor saldo awal (B-04)', () => {
  it('membatalkan lewat baris pembalik dan saldonya kembali nol', async () => {
    const context = await setupToko()
    const commit = await post(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah,harga beli\nBR-1,Gudang,10,5000\n',
      idempotencyKey: 'kunci-batal-saldo-panjang',
    })
    expect(commit.statusCode).toBe(201)
    const jobId = commit.body.importJobId as number

    const batal = await post(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(200)
    expect(batal.body.cancelled).toBe(1)

    expect(await saldo(context)).toBe(0)

    // Ledger tidak dihapus: baris aslinya tetap ada, ditambah baris pembalik.
    const gerak = await db.query<{ kind: string; reason_code: string }>(
      'select kind, reason_code from stock_movements where workspace_id = $1 order by id',
      [context.workspaceId],
    )
    expect(gerak.rows.map((row) => row.reason_code)).toEqual(['saldo_awal', 'pembatalan_impor'])
    expect(gerak.rows[1]!.kind).toBe('keluar')

    // Setelah dibatalkan, berkas yang sama boleh diimpor lagi.
    const ulang = await post(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah,harga beli\nBR-1,Gudang,10,5000\n',
      idempotencyKey: 'kunci-batal-saldo-ulang',
    })
    expect(ulang.statusCode).toBe(201)
    expect(await saldo(context)).toBe(10)
  })

  it('tidak bisa dibatalkan setelah stoknya terpakai transaksi lain', async () => {
    const context = await setupToko()
    const commit = await post(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah\nBR-1,Gudang,10\n',
      idempotencyKey: 'kunci-saldo-terpakai-panjang',
    })
    expect(commit.statusCode).toBe(201)
    const jobId = commit.body.importJobId as number

    const keluar = await post(context, '/stock/movements', {
      productId: context.productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '4',
      reasonCode: 'penjualan',
      idempotencyKey: 'kunci-keluar-saldo-panjang',
    })
    expect(keluar.statusCode).toBe(201)

    const batal = await post(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(409)
    expect(batal.body.error).toBe('impor_tidak_bisa_dibatalkan')

    expect(await saldo(context)).toBe(6)
  })
})
