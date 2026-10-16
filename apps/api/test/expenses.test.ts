import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { looksLikeStockPurchase } from '@sahabat/shared'

/**
 * PRD 6.5: pengeluaran operasional dengan tanggal, kategori, deskripsi, nominal,
 * referensi, lampiran, dan pembuat. Kategori diatur Owner dan Admin. Pembelian lewat
 * PO tidak boleh dicatat ulang sebagai pengeluaran.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let db: Database
let app: FastifyInstance
let storageDir = ''
let previousStorageDir: string | undefined

beforeAll(async () => {
  previousStorageDir = process.env.OBJECT_STORAGE_DIR
  storageDir = await mkdtemp(join(tmpdir(), 'sahabat-expenses-'))
  process.env.OBJECT_STORAGE_DIR = storageDir
  db = await createTestDatabase()
  app = await buildApp({ db, sessionSecret: 'rahasia-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
  if (previousStorageDir === undefined) delete process.env.OBJECT_STORAGE_DIR
  else process.env.OBJECT_STORAGE_DIR = previousStorageDir
  await rm(storageDir, { recursive: true, force: true })
})

interface Toko {
  ownerCookie: string
  staffCookie: string
  workspaceId: number
  purchaseOrderId: number
}

let sequence = 0
let passwordHash = ''

async function setupToko(): Promise<Toko> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const ownerEmail = `pengeluaran-${sequence}@contoh.test`
  const staffEmail = `pengeluaran-staf-${sequence}@contoh.test`

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
    [`pengeluaran-${sequence}`, `Toko Pengeluaran ${sequence}`, owner.rows[0]!.id],
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

  const supplier = await db.query<{ id: string }>(
    'insert into suppliers (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'CV Sumber Pangan'],
  )
  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Kios'],
  )
  const order = await db.query<{ id: string }>(
    `insert into purchase_orders
           (workspace_id, number, status, ordered_on, supplier_id, location_id,
            total_amount, created_by)
     values ($1, 'PO-2026-0001', 'disetujui', '2026-10-01', $2, $3, 500000, $4)
     returning id`,
    [workspaceId, supplier.rows[0]!.id, location.rows[0]!.id, owner.rows[0]!.id],
  )

  return {
    ownerCookie: await login(ownerEmail),
    staffCookie: await login(staffEmail),
    workspaceId,
    purchaseOrderId: Number(order.rows[0]!.id),
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

async function catat(
  toko: Toko,
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.workspaceId}/expenses`,
    headers: { cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('Mencatat pengeluaran', () => {
  it('menyimpan tanggal, kategori, deskripsi, nominal, dan pembuat', async () => {
    const toko = await setupToko()

    const hasil = await catat(toko, toko.ownerCookie, {
      spentOn: '2026-10-05',
      categoryName: 'Sewa kios',
      description: 'Sewa kios bulan Oktober',
      amount: '1.500.000',
      reference: 'KTR-0912',
    })

    expect(hasil.statusCode).toBe(201)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expenses/${hasil.body.expenseId}`,
      headers: { cookie: toko.ownerCookie },
    })
    const isi = detail.json()
    expect(isi.expense.spentOn).toBe('2026-10-05')
    expect(isi.expense.categoryName).toBe('Sewa kios')
    expect(isi.expense.amount).toBe(1_500_000)
    expect(isi.expense.reference).toBe('KTR-0912')
    expect(isi.expense.createdByName).toBe('Pemilik')
  })

  it('menolak nominal nol dan nominal negatif', async () => {
    const toko = await setupToko()

    const nol = await catat(toko, toko.ownerCookie, {
      categoryName: 'Sewa kios',
      description: 'Sewa kios',
      amount: '0',
    })
    expect(nol.statusCode).toBe(400)

    const negatif = await catat(toko, toko.ownerCookie, {
      categoryName: 'Sewa kios',
      description: 'Sewa kios',
      amount: '-5000',
    })
    expect(negatif.statusCode).toBe(400)
  })

  it('menolak staf yang tidak mendapat izin mencatat pengeluaran', async () => {
    const toko = await setupToko()

    const hasil = await catat(toko, toko.staffCookie, {
      spentOn: '2026-10-05',
      categoryName: 'Listrik',
      description: 'Token listrik',
      amount: '150000',
    })

    expect(hasil.statusCode).toBe(403)
  })

  it('menyaring daftar berdasarkan periode dan kategori', async () => {
    const toko = await setupToko()

    await catat(toko, toko.ownerCookie, {
      spentOn: '2026-10-05',
      categoryName: 'Listrik',
      description: 'Token listrik Oktober',
      amount: '150000',
    })
    await catat(toko, toko.ownerCookie, {
      spentOn: '2026-09-05',
      categoryName: 'Listrik',
      description: 'Token listrik September',
      amount: '140000',
    })

    const semua = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expenses`,
      headers: { cookie: toko.ownerCookie },
    })
    expect(semua.json().pagination.total).toBe(2)
    expect(semua.json().summary.totalAmount).toBe(290_000)

    const oktober = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expenses?from=2026-10-01&to=2026-10-31`,
      headers: { cookie: toko.ownerCookie },
    })
    expect(oktober.json().pagination.total).toBe(1)
    expect(oktober.json().expenses[0].description).toBe('Token listrik Oktober')
  })
})

describe('Kategori pengeluaran', () => {
  it('Owner dan Admin boleh menambah kategori, staf tidak', async () => {
    const toko = await setupToko()

    const olehOwner = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories`,
      headers: { cookie: toko.ownerCookie },
      payload: { name: 'Transportasi' },
    })
    expect(olehOwner.statusCode).toBe(201)

    const olehStaf = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories`,
      headers: { cookie: toko.staffCookie },
      payload: { name: 'Transportasi' },
    })
    expect(olehStaf.statusCode).toBe(403)
  })

  it('mengarsipkan kategori tanpa menghapus pengeluarannya', async () => {
    const toko = await setupToko()
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories`,
      headers: { cookie: toko.ownerCookie },
      payload: { name: 'Perawatan alat' },
    })
    const categoryId = dibuat.json().categoryId as number

    await catat(toko, toko.ownerCookie, {
      categoryId,
      description: 'Ganti pisau',
      amount: '75000',
    })

    await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories/${categoryId}`,
      headers: { cookie: toko.ownerCookie },
      payload: { isArchived: true },
    })

    const daftar = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories`,
      headers: { cookie: toko.ownerCookie },
    })
    expect(daftar.json().categories.map((item: { id: number }) => item.id)).not.toContain(categoryId)

    const termasukArsip = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories?archived=true`,
      headers: { cookie: toko.ownerCookie },
    })
    const ditemukan = termasukArsip.json().categories.find(
      (item: { id: number }) => item.id === categoryId,
    )
    expect(ditemukan.expenseCount).toBe(1)
    expect(ditemukan.totalAmount).toBe(75_000)
  })

  it('menyuspend memakai kategori yang sama dua kali', async () => {
    const toko = await setupToko()

    await catat(toko, toko.ownerCookie, {
      categoryName: 'Listrik',
      description: 'Token listrik',
      amount: '150000',
    })
    const kedua = await catat(toko, toko.ownerCookie, {
      categoryName: 'Listrik',
      description: 'Token listrik lagi',
      amount: '150000',
    })

    // Kategori sama di dua pengeluaran itu memang diperbolehkan; yang diperiksa di sini
    // hanya bahwa kategori tidak tercipta dua kali.
    expect(kedua.statusCode).toBe(201)

    const daftar = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expense-categories`,
      headers: { cookie: toko.ownerCookie },
    })
    const listrik = daftar
      .json()
      .categories.filter((item: { name: string }) => item.name === 'Listrik')
    expect(listrik).toHaveLength(1)
    expect(listrik[0].expenseCount).toBe(2)
  })
})

describe('Peringatan pembelian yang terhitung dua kali (PRD 6.5)', () => {
  it('menandai kategori yang terdengar seperti pembelian barang dagangan', () => {
    expect(looksLikeStockPurchase('Bahan Baku')).toBe(true)
    expect(looksLikeStockPurchase('Stok dagangan')).toBe(true)
    expect(looksLikeStockPurchase('Pembelian barang')).toBe(true)
  })

  it('tidak menandai biaya operasional yang tidak berkaitan dengan stok', () => {
    expect(looksLikeStockPurchase('Sewa kios')).toBe(false)
    expect(looksLikeStockPurchase('Listrik')).toBe(false)
    expect(looksLikeStockPurchase('Gaji')).toBe(false)
    expect(looksLikeStockPurchase('')).toBe(false)
  })

  it('mengembalikan peringatan setelah pengeluaran tersimpan, tanpa menolaknya', async () => {
    const toko = await setupToko()

    const hasil = await catat(toko, toko.ownerCookie, {
      categoryName: 'Pembelian bahan baku',
      description: 'Beli bahan baku',
      amount: '250000',
    })

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.warnings).toHaveLength(1)
    expect(String((hasil.body.warnings as string[])[0])).toContain('Pembelian bahan baku')
  })

  it('tidak memberi peringatan untuk biaya operasional biasa', async () => {
    const toko = await setupToko()

    const hasil = await catat(toko, toko.ownerCookie, {
      categoryName: 'Sewa kios',
      description: 'Sewa kios',
      amount: '1500000',
    })

    expect(hasil.body.warnings).toHaveLength(0)
  })
})

describe('Penautan ganda ke purchase order (PRD 6.5)', () => {
  it('menolak tautan PO yang sudah dipakai pengeluaran lain', async () => {
    const toko = await setupToko()

    const pertama = await catat(toko, toko.ownerCookie, {
      description: 'Biaya tambahan PO',
      amount: '50000',
      purchaseOrderId: toko.purchaseOrderId,
    })
    expect(pertama.statusCode).toBe(201)

    const kedua = await catat(toko, toko.ownerCookie, {
      description: 'Biaya tambahan PO lagi',
      amount: '50000',
      purchaseOrderId: toko.purchaseOrderId,
    })

    expect(kedua.statusCode).toBe(409)
    expect(kedua.body.error).toBe('po_sudah_terhubung')

    const jumlah = await db.query<{ total: string }>(
      'select count(*) as total from expenses where workspace_id = $1',
      [toko.workspaceId],
    )
    expect(Number(jumlah.rows[0]!.total)).toBe(1)
  })

  it('menolak tautan ke PO milik workspace lain', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()

    const hasil = await catat(tokoB, tokoB.ownerCookie, {
      description: 'Mencoba menautkan PO milik orang lain',
      amount: '50000',
      purchaseOrderId: tokoA.purchaseOrderId,
    })

    expect(hasil.statusCode).toBe(404)
    expect(hasil.body.error).toBe('po_tidak_ditemukan')
  })

  it('menampilkan nomor PO pada daftar pengeluaran', async () => {
    const toko = await setupToko()

    await catat(toko, toko.ownerCookie, {
      description: 'Ongkos bongkar',
      amount: '75000',
      purchaseOrderId: toko.purchaseOrderId,
    })

    const daftar = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expenses`,
      headers: { cookie: toko.ownerCookie },
    })
    expect(daftar.json().expenses[0].purchaseOrderNumber).toBe('PO-2026-0001')
  })
})

describe('Pengeluaran tidak dapat dihapus', () => {
  it('database menolak penghapusan pengeluaran', async () => {
    const toko = await setupToko()
    const hasil = await catat(toko, toko.ownerCookie, {
      categoryName: 'Listrik',
      description: 'Token listrik',
      amount: '150000',
    })

    await expect(
      db.query('delete from expenses where id = $1', [hasil.body.expenseId]),
    ).rejects.toThrow()
  })
})

describe('Lampiran pengeluaran (PRD 6.5)', () => {
  it('menyimpan foto dan melayani lampiran hanya untuk anggota yang punya izin membaca pengeluaran', async () => {
    const toko = await setupToko()
    const expense = await catat(toko, toko.ownerCookie, {
      description: 'Nota listrik',
      amount: '150000',
    })

    const upload = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/expenses/${expense.body.expenseId}/attachments`,
      headers: { cookie: toko.ownerCookie },
      payload: {
        contentType: 'image/png',
        fileName: 'nota.png',
        data: `data:image/png;base64,${PNG_1X1}`,
      },
    })
    expect(upload.statusCode).toBe(201)

    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.workspaceId}/expenses/${expense.body.expenseId}`,
      headers: { cookie: toko.ownerCookie },
    })
    const attachment = detail.json().attachments[0] as { url: string }
    expect(attachment.url).toContain('/media/')

    const media = await app.inject({
      method: 'GET',
      url: attachment.url,
      headers: { cookie: toko.ownerCookie },
    })
    expect(media.statusCode).toBe(200)
    expect(media.headers['content-type']).toBe('image/png')

    const staffRead = await app.inject({
      method: 'GET',
      url: attachment.url,
      headers: { cookie: toko.staffCookie },
    })
    expect(staffRead.statusCode).toBe(403)
  })

  it('menolak unggahan saat jenis berkas tidak cocok dengan isinya', async () => {
    const toko = await setupToko()
    const expense = await catat(toko, toko.ownerCookie, {
      description: 'Nota tidak valid',
      amount: '10000',
    })
    const upload = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/expenses/${expense.body.expenseId}/attachments`,
      headers: { cookie: toko.ownerCookie },
      payload: { contentType: 'application/pdf', fileName: 'nota.pdf', data: `data:application/pdf;base64,${PNG_1X1}` },
    })
    expect(upload.statusCode).toBe(400)
    expect(upload.json().error).toBe('isi_berkas_tidak_cocok')
  })
})

describe('Isolasi workspace pada pengeluaran', () => {
  it('menolak melihat pengeluaran milik workspace lain', async () => {
    const tokoA = await setupToko()
    const tokoB = await setupToko()

    const hasil = await catat(tokoA, tokoA.ownerCookie, {
      description: 'Sewa kios',
      amount: '1500000',
    })

    const dibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${tokoB.workspaceId}/expenses/${hasil.body.expenseId}`,
      headers: { cookie: tokoB.ownerCookie },
    })
    expect(dibaca.statusCode).toBe(404)

    const daftarB = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${tokoB.workspaceId}/expenses`,
      headers: { cookie: tokoB.ownerCookie },
    })
    expect(daftarB.json().pagination.total).toBe(0)
  })
})
