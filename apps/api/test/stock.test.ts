import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider, type EmailProvider } from '../src/services/email.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'

/**
 * PRD 6.2: produk, lokasi, stok masuk dan keluar, penyesuaian, stok opname, dan
 * tanggal kedaluwarsa per penerimaan. Berkas ini memeriksa kriteria penerimaan
 * PRD 6.2 satu per satu, kecuali syarat dua pengguna bersamaan yang hanya bisa
 * diuji terhadap PostgreSQL sungguhan dan berada di proyek postgres.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance
let email: EmailProvider

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

interface Workspace {
  cookie: string
  workspaceId: number
  userId: number
  locationId: number
  ownerEmail: string
}

let sequence = 0
let passwordHash = ''

/**
 * Workspace baru untuk setiap skenario, supaya satu tes tidak bergantung pada tes
 * lain. Akun dibuat langsung dengan hash Argon2id karena yang diuji di sini adalah
 * modul stok; alur pendaftaran punya berkasnya sendiri.
 */
async function setupWorkspace(prefix = 'Toko'): Promise<Workspace> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const ownerEmail = `${prefix.toLowerCase()}-${sequence}@contoh.test`

  const owner = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, $3, now())
     returning id`,
    [ownerEmail, passwordHash, `Pemilik ${prefix}`],
  )
  const userId = owner.rows[0]!.id

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`toko-${prefix.toLowerCase()}-${sequence}`, `Toko ${prefix} ${sequence}`, userId],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    userId,
    'owner',
  ])

  const location = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, 'Gudang Utama'],
  )
  const locationId = location.rows[0]!.id

  return { cookie: await loginAs(ownerEmail), workspaceId, userId, locationId, ownerEmail }
}

async function loginAs(emailAddress: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: emailAddress, password: PASSWORD },
  })
  if (response.statusCode !== 200) {
    throw new Error(`Masuk gagal: ${response.statusCode} ${response.body}`)
  }
  return cookieOf(response)
}

/** Anggota tambahan dengan peran tertentu, untuk menguji izin di server (PRD 8). */
async function addMember(context: Workspace, role: 'staff' | 'viewer' | 'purchasing'): Promise<string> {
  const address = `${context.ownerEmail.split('@')[0]}-${role}@contoh.test`
  const member = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, $3, now())
     returning id`,
    [address, passwordHash, `Anggota ${role}`],
  )

  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    context.workspaceId,
    member.rows[0]!.id,
    role,
  ])

  return loginAs(address)
}

async function createProduct(
  context: Workspace,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}/products`,
    headers: { cookie: context.cookie },
    payload: {
      sku: `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: 'Kopi Bubuk 250 g',
      unitCode: 'pcs',
      ...overrides,
    },
  })
  if (response.statusCode !== 201) {
    throw new Error(`Buat produk gagal: ${response.statusCode} ${response.body}`)
  }
  return response.json().productId as number
}

async function recordStock(
  context: Workspace,
  payload: Record<string, unknown>,
  cookie = context.cookie,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}/stock/movements`,
    headers: { cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('produk, kategori, dan lokasi (PRD 6.2)', () => {
  it('membuat produk dan sku unik per workspace', async () => {
    const context = await setupWorkspace('Sku')
    const productId = await createProduct(context, { sku: 'KOPI-001' })

    const ulang = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products`,
      headers: { cookie: context.cookie },
      payload: { sku: 'KOPI-001', name: 'Kopi Lain', unitCode: 'pcs' },
    })
    expect(ulang.statusCode).toBe(409)

    // SKU yang sama di workspace lain tetap boleh, karena keunikan per workspace.
    const lain = await setupWorkspace('Sku')
    const diWorkspaceLain = await createProduct(lain, { sku: 'KOPI-001' })
    expect(diWorkspaceLain).toBeGreaterThan(0)
    expect(productId).toBeGreaterThan(0)
  })

  it('menolak satuan di luar daftar sarat', async () => {
    const context = await setupWorkspace('Satuan')
    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products`,
      headers: { cookie: context.cookie },
      payload: { sku: 'SAT-1', name: 'Barang Odd', unitCode: 'ton' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('menolak jumlah dengan presisi lebih tinggi dari yang bisa disimpan', async () => {
    const context = await setupWorkspace('Presisi')
    const productId = await createProduct(context)

    const response = await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '1.234567',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    expect(response.statusCode).toBe(400)
  })

  it('mengarsipkan produk tanpa menghapus riwayat', async () => {
    const context = await setupWorkspace('Arsip')
    const productId = await createProduct(context)
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}`,
      headers: { cookie: context.cookie },
      payload: { status: 'diarsipkan' },
    })
    expect(archived.statusCode).toBe(200)

    const riwayat = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/movements`,
      headers: { cookie: context.cookie },
    })
    expect(riwayat.json().movements).toHaveLength(1)

    // Produk diarsipkan tidak boleh dipakai untuk input baru.
    const baru = await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '1',
      reasonCode: 'penjualan',
    })
    expect(baru.statusCode).toBe(409)
    expect(baru.body.error).toBe('produk_diarsipkan')
  })

  it('menandai lokasi pertama sebagai lokasi bawaan', async () => {
    const context = await setupWorkspace('Bawaan')

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/locations`,
      headers: { cookie: context.cookie },
    })

    const lokasi = response.json().locations as Array<{ id: number; isDefault: boolean }>
    expect(lokasi.find((item) => item.id === context.locationId)?.isDefault).toBe(true)
  })
})

describe('kriteria penerimaan PRD 6.2', () => {
  it('saldo selalu sama dengan jumlah semua transaksi yang berhasil', async () => {
    const context = await setupWorkspace('Saldo')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '4',
      reasonCode: 'penjualan',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'penyesuaian_naik',
      quantity: '2',
      unitCost: '10000',
      reasonCode: 'rusak',
    })

    const ledger = await db.query<{ total: string }>(
      `select coalesce(sum(case when direction = 'tambah' then quantity else -quantity end), 0)::text as total
         from stock_movements where product_id = $1`,
      [productId],
    )

    const balance = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [productId],
    )

    expect(balance.rows[0]!.quantity).toBe(ledger.rows[0]!.total)
    expect(balance.rows[0]!.quantity).toBe('8.0000')
  })

  it('menolak stok negatif dan pesan menyebut produk, lokasi, dan saldo', async () => {
    const context = await setupWorkspace('Negatif')
    const productId = await createProduct(context, { name: 'Susu UHT' })

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '3',
      unitCost: '5000',
      reasonCode: 'pembelian',
    })

    const response = await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '5',
      reasonCode: 'penjualan',
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.error).toBe('stok_tidak_cukup')
    expect(response.body.message).toContain('Susu UHT')
    expect(response.body.message).toContain('Gudang Utama')
    expect(response.body.message).toContain('3')
  })

  it('transaksi gagal tidak mengubah saldo maupun menambah baris riwayat', async () => {
    const context = await setupWorkspace('Gagal')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '7',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const sebelum = await countMovements(db, productId)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '99',
      reasonCode: 'penjualan',
    })

    const sesudah = await countMovements(db, productId)
    const balance = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [productId],
    )

    expect(sesudah).toBe(sebelum)
    expect(balance.rows[0]!.quantity).toBe('7.0000')
  })

  it('riwayat tidak dapat diubah atau dihapus', async () => {
    const context = await setupWorkspace('Riwayat')
    const productId = await createProduct(context)
    const masuk = await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '2',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    await expect(
      db.query('update stock_movements set quantity = 999 where id = $1', [masuk.body.movementId]),
    ).rejects.toThrow(/tidak dapat diubah atau dihapus/)

    await expect(db.query('delete from stock_movements where id = $1', [masuk.body.movementId])).rejects.toThrow(
      /tidak dapat diubah atau dihapus/,
    )
  })

  it('koreksi ditulis sebagai baris baru, bukan dengan mengubah baris lama', async () => {
    const context = await setupWorkspace('Koreksi')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '2',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'penyesuaian_turun',
      quantity: '1',
      reasonCode: 'salah_catat',
      note: 'Barang sebenarnya belum masuk',
    })

    const movements = await db.query<{ kind: string; balance_after: string }>(
      'select kind, balance_after from stock_movements where product_id = $1 order by id asc',
      [productId],
    )

    expect(movements.rows.map((row) => row.kind)).toEqual(['masuk', 'penyesuaian_turun'])
    expect(movements.rows[1]!.balance_after).toBe('1.0000')
  })

  it('menyimpan saldo sebelum dan sesudah pada setiap baris', async () => {
    const context = await setupWorkspace('SaldoBaris')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '4',
      reasonCode: 'penjualan',
    })

    const rows = await db.query<{ balance_before: string; balance_after: string }>(
      'select balance_before, balance_after from stock_movements where product_id = $1 order by id asc',
      [productId],
    )

    expect(rows.rows[0]!.balance_before).toBe('0.0000')
    expect(rows.rows[0]!.balance_after).toBe('10.0000')
    expect(rows.rows[1]!.balance_before).toBe('10.0000')
    expect(rows.rows[1]!.balance_after).toBe('6.0000')
  })

  it('permintaan yang terkirim dua kali tidak menggandakan stok', async () => {
    const context = await setupWorkspace('Idempoten')
    const productId = await createProduct(context)

    const payload = {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
      idempotencyKey: 'kunci-unik-untuk-uji-ini',
    }

    const pertama = await recordStock(context, payload)
    const kedua = await recordStock(context, payload)

    expect(pertama.statusCode).toBe(201)
    expect(kedua.statusCode).toBe(200)
    expect(kedua.body.replayed).toBe(true)
    expect(kedua.body.movementId).toBe(pertama.body.movementId)

    const balance = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [productId],
    )
    expect(balance.rows[0]!.quantity).toBe('5.0000')
  })
})

describe('saldo per lokasi (PRD 6.2)', () => {
  it('menghitung saldo terpisah untuk tiap produk dan lokasi', async () => {
    const context = await setupWorkspace('Lokasi')
    const productId = await createProduct(context)

    const gudangKedai = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/locations`,
      headers: { cookie: context.cookie },
      payload: { name: 'Kedai' },
    })
    const kedaiId = gudangKedai.json().locationId as number

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: kedaiId,
      kind: 'masuk',
      quantity: '4',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: kedaiId,
      kind: 'keluar',
      quantity: '3',
      reasonCode: 'penjualan',
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/balances`,
      headers: { cookie: context.cookie },
    })

    const balances = response.json().balances as Array<{
      locationId: number
      quantity: number
    }>
    const diGudang = balances.find((item) => item.locationId === context.locationId)
    const diKedai = balances.find((item) => item.locationId === kedaiId)

    expect(diGudang?.quantity).toBe(10)
    expect(diKedai?.quantity).toBe(1)
  })
})

describe('rata-rata bergerak dan harga pokok (PRD 7)', () => {
  it('menghitung ulang rata-rata pada penerimaan kedua', async () => {
    const context = await setupWorkspace('RataRata')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '20000',
      reasonCode: 'pembelian',
    })

    const cost = await db.query<{ average_cost: string; inventory_value: string }>(
      'select average_cost, inventory_value from product_costs where product_id = $1',
      [productId],
    )

    expect(cost.rows[0]!.average_cost).toBe('15000.0000')
    expect(Number(cost.rows[0]!.inventory_value)).toBe(300000)
  })

  it('barang keluar tidak mengubah rata-rata, hanya nilai persediaan', async () => {
    const context = await setupWorkspace('Keluar')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '4',
      reasonCode: 'penjualan',
    })

    const cost = await db.query<{ average_cost: string; inventory_value: string }>(
      'select average_cost, inventory_value from product_costs where product_id = $1',
      [productId],
    )

    expect(cost.rows[0]!.average_cost).toBe('10000.0000')
    expect(Number(cost.rows[0]!.inventory_value)).toBe(60000)
  })

  it('barang masuk tanpa harga memakai rata-rata yang berlaku', async () => {
    const context = await setupWorkspace('TanpaHarga')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '12000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'penyesuaian_naik',
      quantity: '2',
      reasonCode: 'rusak',
    })

    const cost = await db.query<{ average_cost: string; inventory_value: string }>(
      'select average_cost, inventory_value from product_costs where product_id = $1',
      [productId],
    )

    expect(cost.rows[0]!.average_cost).toBe('12000.0000')
    expect(Number(cost.rows[0]!.inventory_value)).toBe(144000)
  })
})

describe('tanggal kedaluwarsa per penerimaan (PRD 6.2, A-05)', () => {
  it('menampilkan tanggal paling awal dari penerimaan yang masih bersaldo', async () => {
    const context = await setupWorkspace('Kedaluwarsa')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '10000',
      reasonCode: 'pembelian',
      expiresAt: '2026-12-31',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
      expiresAt: '2026-11-30',
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/balances`,
      headers: { cookie: context.cookie },
    })

    const balances = response.json().balances as Array<{ earliestExpiry: string }>
    expect(balances[0]!.earliestExpiry).toBe('2026-11-30')
  })

  it('tidak memakai lot yang sudah habis', async () => {
    const context = await setupWorkspace('LotHabis')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '2',
      unitCost: '10000',
      reasonCode: 'pembelian',
      expiresAt: '2026-10-01',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '8',
      unitCost: '10000',
      reasonCode: 'pembelian',
      expiresAt: '2027-01-01',
    })
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'keluar',
      quantity: '2',
      reasonCode: 'penjualan',
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/balances`,
      headers: { cookie: context.cookie },
    })

    const balances = response.json().balances as Array<{ earliestExpiry: string }>
    expect(balances[0]!.earliestExpiry).toBe('2027-01-01')
  })
})

describe('stok opname (PRD 6.2)', () => {
  it('membuat selisih menjadi transaksi penyesuaian setelah disetujui', async () => {
    const context = await setupWorkspace('Opname')
    const productA = await createProduct(context, { name: 'Beras 5 kg' })
    const productB = await createProduct(context, { name: 'Minyak 1 L' })

    await recordStock(context, {
      productId: productA,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '10',
      unitCost: '60000',
      reasonCode: 'pembelian',
    })
    await recordStock(context, {
      productId: productB,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '4',
      unitCost: '18000',
      reasonCode: 'pembelian',
    })

    const mulai = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts`,
      headers: { cookie: context.cookie },
      payload: { locationId: context.locationId },
    })
    expect(mulai.statusCode).toBe(201)
    const countId = mulai.json().countId as number

    await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/items/${productA}`,
      headers: { cookie: context.cookie },
      payload: { countedQuantity: '8' },
    })
    await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/items/${productB}`,
      headers: { cookie: context.cookie },
      payload: { countedQuantity: '4' },
    })

    const detail = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}`,
      headers: { cookie: context.cookie },
    })
    const items = detail.json().items as Array<{
      productId: number
      systemQuantity: number
      countedQuantity: number
      variance: number | null
    }>
    const beras = items.find((item) => item.productId === productA)!
    expect(beras.systemQuantity).toBe(10)
    expect(beras.variance).toBe(-2)

    // Sebelum disetujui, stok belum berubah.
    const sebelum = await balanceOf(db, productA)
    expect(sebelum).toBe('10.0000')

    const setujui = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/approve`,
      headers: { cookie: context.cookie },
    })
    expect(setujui.statusCode).toBe(200)
    expect(setujui.json().adjustments).toBe(1)

    const sesudah = await balanceOf(db, productA)
    expect(sesudah).toBe('8.0000')

    // Produk yang angkanya sama tidak menghasilkan transaksi apa pun.
    const movements = await db.query<{ product_id: number }>(
      "select product_id from stock_movements where reason_code = 'opname'",
    )
    expect(movements.rows).toHaveLength(1)
  })

  it('menolak persetujuan kedua untuk sesi yang sama', async () => {
    const context = await setupWorkspace('OpnameUlang')
    const productId = await createProduct(context)

    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const mulai = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts`,
      headers: { cookie: context.cookie },
      payload: { locationId: context.locationId },
    })
    const countId = mulai.json().countId as number

    await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/items/${productId}`,
      headers: { cookie: context.cookie },
      payload: { countedQuantity: '4' },
    })

    const pertama = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/approve`,
      headers: { cookie: context.cookie },
    })
    expect(pertama.statusCode).toBe(200)

    const kedua = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/approve`,
      headers: { cookie: context.cookie },
    })
    expect(kedua.statusCode).toBe(409)
  })

  it('melanjutkan sesi yang sudah terbuka untuk lokasi yang sama', async () => {
    const context = await setupWorkspace('OpnameLanjut')

    const pertama = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts`,
      headers: { cookie: context.cookie },
      payload: { locationId: context.locationId },
    })
    const kedua = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts`,
      headers: { cookie: context.cookie },
      payload: { locationId: context.locationId },
    })

    expect(kedua.statusCode).toBe(200)
    expect(kedua.json().countId).toBe(pertama.json().countId)
    expect(kedua.json().resumed).toBe(true)
  })
})

describe('izin per peran (PRD 8)', () => {
  it('staf boleh mencatat barang keluar tetapi tidak boleh membuat penyesuaian', async () => {
    const context = await setupWorkspace('Peran')
    const productId = await createProduct(context)
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const stafCookie = await addMember(context, 'staff')
    const keluar = await recordStock(
      context,
      {
        productId,
        locationId: context.locationId,
        kind: 'keluar',
        quantity: '1',
        reasonCode: 'penjualan',
      },
      stafCookie,
    )
    expect(keluar.statusCode).toBe(201)

    const penyesuaian = await recordStock(
      context,
      {
        productId,
        locationId: context.locationId,
        kind: 'penyesuaian_naik',
        quantity: '1',
        unitCost: '10000',
        reasonCode: 'rusak',
      },
      stafCookie,
    )
    expect(penyesuaian.statusCode).toBe(403)
  })

  it('viewer tidak boleh mencatat stok dan boleh membaca saldo', async () => {
    const context = await setupWorkspace('Peran')
    const productId = await createProduct(context)
    const viewerCookie = await addMember(context, 'viewer')

    const catat = await recordStock(
      context,
      {
        productId,
        locationId: context.locationId,
        kind: 'masuk',
        quantity: '1',
        unitCost: '10000',
        reasonCode: 'pembelian',
      },
      viewerCookie,
    )
    expect(catat.statusCode).toBe(403)

    const baca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/stock/balances`,
      headers: { cookie: viewerCookie },
    })
    expect(baca.statusCode).toBe(200)
  })

  it('staf boleh mengisi opname tetapi tidak boleh menyetujuinya', async () => {
    const context = await setupWorkspace('OpnamePeran')
    const productId = await createProduct(context)
    await recordStock(context, {
      productId,
      locationId: context.locationId,
      kind: 'masuk',
      quantity: '5',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const stafCookie = await addMember(context, 'staff')

    const mulai = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts`,
      headers: { cookie: stafCookie },
      payload: { locationId: context.locationId },
    })
    const countId = mulai.json().countId as number

    const isi = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/items/${productId}`,
      headers: { cookie: stafCookie },
      payload: { countedQuantity: '4' },
    })
    expect(isi.statusCode).toBe(200)

    const setujui = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/counts/${countId}/approve`,
      headers: { cookie: stafCookie },
    })
    expect(setujui.statusCode).toBe(403)
  })
})

describe('isolasi workspace pada modul stok (PRD 9)', () => {
  it('menolak produk, lokasi, dan riwayat milik workspace lain', async () => {
    const asing = await setupWorkspace('Asing')
    const productId = await createProduct(asing)
    await recordStock(asing, {
      productId,
      locationId: asing.locationId,
      kind: 'masuk',
      quantity: '3',
      unitCost: '10000',
      reasonCode: 'pembelian',
    })

    const pencoba = await setupWorkspace('Pencoba')

    const bacaProduk = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${pencoba.workspaceId}/products/${productId}`,
      headers: { cookie: pencoba.cookie },
    })
    expect(bacaProduk.statusCode).toBe(404)

    const catat = await recordStock(
      pencoba,
      {
        productId,
        locationId: asing.locationId,
        kind: 'keluar',
        quantity: '1',
        reasonCode: 'penjualan',
      },
      pencoba.cookie,
    )
    expect(catat.statusCode).toBe(404)

    const riwayat = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${pencoba.workspaceId}/stock/movements?productId=${productId}`,
      headers: { cookie: pencoba.cookie },
    })
    expect(riwayat.json().movements).toHaveLength(0)
  })

  it('menolak kategori milik workspace lain saat membuat produk', async () => {
    const asing = await setupWorkspace('KategoriAsing')
    const kategori = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${asing.workspaceId}/categories`,
      headers: { cookie: asing.cookie },
      payload: { name: 'Minuman' },
    })
    const categoryId = kategori.json().categoryId as number

    const pencoba = await setupWorkspace('KategoriPencoba')
    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${pencoba.workspaceId}/products`,
      headers: { cookie: pencoba.cookie },
      payload: { sku: 'MIN-1', name: 'Sirup', unitCode: 'botol', categoryId },
    })

    // Satuan "botol" di luar daftar sarat, jadi isiannya ditolak lebih dulu.
    expect(response.statusCode).toBe(400)

    // Dengan satuan yang sah, kategori milik workspace lain tetap ditolak. Foreign
    // key komposit di database yang menahannya, bukan pemeriksaan di aplikasi.
    const sah = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${pencoba.workspaceId}/products`,
      headers: { cookie: pencoba.cookie },
      payload: { sku: 'MIN-2', name: 'Sirup', unitCode: 'pcs', categoryId },
    })
    expect(sah.statusCode).toBe(404)
    expect(sah.json().error).toBe('kategori_tidak_ditemukan')

    const tersimpan = await db.query('select 1 from products where workspace_id = $1', [
      pencoba.workspaceId,
    ])
    expect(tersimpan.rows).toHaveLength(0)
  })
})

async function countMovements(db: Database, productId: number): Promise<number> {
  const result = await db.query<{ total: string }>(
    'select count(*)::int as total from stock_movements where product_id = $1',
    [productId],
  )
  return Number(result.rows[0]!.total)
}

async function balanceOf(db: Database, productId: number): Promise<string> {
  const result = await db.query<{ quantity: string }>(
    'select quantity from stock_balances where product_id = $1',
    [productId],
  )
  return result.rows[0]?.quantity ?? '0.0000'
}
