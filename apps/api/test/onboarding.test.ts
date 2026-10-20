import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { hashPassword } from '../src/auth/password.ts'
import { hashToken } from '../src/auth/token.ts'
import { cookieOf } from './account-helpers.ts'

/**
 * Daftar periksa aktivasi (PRD 12).
 *
 * Yang diuji: langkah dihitung dari data nyata, bukan angka contoh; langkah
 * opsional bisa dilewati dan ditemukan lagi; hanya Owner dan Admin yang boleh
 * melompati; akses lintas workspace ditolak di server, bukan hanya di tombol.
 */

let db: Database
let app: FastifyInstance
let sequence = 0
let passwordHash = ''

beforeAll(async () => {
  db = await createTestDatabase()
  app = await buildApp({ db, sessionSecret: 'rahasia-aktivasi-uji', origin: 'http://localhost:3000' })
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
     values ($1, $2, 'Penguji Aktivasi', now()) returning id`,
    [`aktivasi-${sequence}@contoh.test`, passwordHash],
  )
  const userId = user.rows[0]!.id
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`aktivasi-${sequence}`, 'Toko Aktivasi', userId],
  )
  const workspaceId = workspace.rows[0]!.id
  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [workspaceId, userId, role])
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `aktivasi-${sequence}@contoh.test`, password: 'kata-sandi-pengujian-2026' } })
  expect(login.statusCode).toBe(200)
  const cookie = cookieOf(login)
  await db.query('update sessions set active_workspace_id = $1 where token_hash = $2', [workspaceId, hashToken(cookie.split('=')[1]!)])
  return { workspaceId, cookie, userId }
}

describe('daftar periksa aktivasi (PRD 12)', () => {
  it('workspace baru menampilkan empat langkah yang belum selesai', async () => {
    const context = await setup()
    const response = await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/onboarding`, headers: { cookie: context.cookie } })
    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(body.langkah.map((langkah: { key: string }) => langkah.key)).toEqual(['profil_usaha', 'produk', 'stok_awal', 'transaksi'])
    for (const langkah of body.langkah) {
      expect(langkah.done).toBe(false)
      expect(langkah.skipped).toBe(false)
      expect(Array.isArray(langkah.sisa)).toBe(true)
      expect(langkah.sisa.length).toBeGreaterThan(0)
    }
    expect(body.semuaSelesai).toBe(false)
  })

  it('langkah selesai dihitung dari data nyata', async () => {
    const context = await setup()

    // Jenis usaha diisi lewat Profil usaha.
    await db.query('update workspaces set business_type = $2 where id = $1', [context.workspaceId, 'kedai kopi'])

    const location = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/locations`, headers: { cookie: context.cookie }, payload: { name: 'Gudang Aktivasi' } })
    const locationId = location.json().locationId as number
    const product = await app.inject({ method: 'POST', url: `/api/workspaces/${context.workspaceId}/products`, headers: { cookie: context.cookie }, payload: { sku: 'AKT-1', name: 'Kopi Bubuk', unitCode: 'pcs', minStock: '3' } })
    const productId = product.json().productId as number

    const dicek = async () => (await app.inject({ method: 'GET', url: `/api/workspaces/${context.workspaceId}/onboarding`, headers: { cookie: context.cookie } })).json()
    const keadaan = (body: { langkah: Array<{ key: string; done: boolean }> }, key: string) => body.langkah.find((langkah) => langkah.key === key)!.done

    expect(keadaan(await dicek(), 'profil_usaha')).toBe(true)
    expect(keadaan(await dicek(), 'produk')).toBe(true)
    expect(keadaan(await dicek(), 'stok_awal')).toBe(false)

    const masuk = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/movements`,
      headers: { cookie: context.cookie },
      payload: { productId, locationId, kind: 'masuk', quantity: '10', reasonCode: 'pembelian', idempotencyKey: `aktivasi-masuk-${sequence}-kunci` },
    })
    expect(masuk.statusCode, masuk.body).toBe(201)
    expect(keadaan(await dicek(), 'stok_awal')).toBe(true)
    expect(keadaan(await dicek(), 'transaksi')).toBe(false)

    const keluar = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/stock/movements`,
      headers: { cookie: context.cookie },
      payload: { productId, locationId, kind: 'keluar', quantity: '2', reasonCode: 'penjualan', idempotencyKey: `aktivasi-keluar-${sequence}-kunci` },
    })
    expect(keluar.statusCode, keluar.body).toBe(201)

    const akhir = await dicek()
    expect(keadaan(akhir, 'transaksi')).toBe(true)
    expect(akhir.semuaSelesai).toBe(true)
  })

  it('langkah bisa dilewati dan ditemukan lagi lewat daftar', async () => {
    const context = await setup()
    const jalur = { method: 'PATCH' as const, url: `/api/workspaces/${context.workspaceId}/onboarding`, headers: { cookie: context.cookie } }

    const lewati = await app.inject({ ...jalur, payload: { step: 'transaksi', skipped: true } })
    expect(lewati.statusCode).toBe(200)
    let transaksi = lewati.json().langkah.find((langkah: { key: string }) => langkah.key === 'transaksi')
    expect(transaksi.skipped).toBe(true)
    // Dilewati bukan berarti selesai.
    expect(transaksi.done).toBe(false)
    expect(lewati.json().semuaSelesai).toBe(false)

    const buka = await app.inject({ ...jalur, payload: { step: 'transaksi', skipped: false } })
    expect(buka.statusCode).toBe(200)
    transaksi = buka.json().langkah.find((langkah: { key: string }) => langkah.key === 'transaksi')
    expect(transaksi.skipped).toBe(false)

    // Baris skip yang sudah dibuka tidak mencentang apa pun di tabel.
    const sisa = await db.query<{ count: string }>('select count(*)::text as count from workspace_onboarding_skips where workspace_id = $1', [context.workspaceId])
    expect(sisa.rows[0]?.count).toBe('0')
  })

  it('hanya Owner dan Admin yang boleh melompati langkah', async () => {
    for (const role of ['owner', 'admin', 'purchasing', 'staff', 'viewer']) {
      const context = await setup(role)
      const response = await app.inject({ method: 'PATCH', url: `/api/workspaces/${context.workspaceId}/onboarding`, headers: { cookie: context.cookie }, payload: { step: 'produk', skipped: true } })
      if (role === 'owner' || role === 'admin') {
        expect(response.statusCode, `peran ${role}`).toBe(200)
      } else {
        expect(response.statusCode, `peran ${role}`).toBe(403)
        expect(response.json().message).toContain('Owner dan Admin')
      }
    }
  })

  it('langkah yang tidak dikenal ditolak', async () => {
    const context = await setup()
    const response = await app.inject({ method: 'PATCH', url: `/api/workspaces/${context.workspaceId}/onboarding`, headers: { cookie: context.cookie }, payload: { step: 'langkah-promo', skipped: true } })
    expect(response.statusCode).toBe(400)
  })

  it('anggota workspace lain tidak bisa membaca atau mengubah daftar', async () => {
    const pemilik = await setup('owner')
    const asing = await setup('owner')

    const baca = await app.inject({ method: 'GET', url: `/api/workspaces/${pemilik.workspaceId}/onboarding`, headers: { cookie: asing.cookie } })
    expect(baca.statusCode).toBe(403)

    const ubah = await app.inject({ method: 'PATCH', url: `/api/workspaces/${pemilik.workspaceId}/onboarding`, headers: { cookie: asing.cookie }, payload: { step: 'produk', skipped: true } })
    expect(ubah.statusCode).toBe(403)

    // Tidak ada skip yang tersimpan untuk workspace korban.
    const sisa = await db.query<{ count: string }>('select count(*)::text as count from workspace_onboarding_skips where workspace_id = $1', [pemilik.workspaceId])
    expect(sisa.rows[0]?.count).toBe('0')

    // Tanpa sesi sama sekali juga ditolak.
    const anonim = await app.inject({ method: 'GET', url: `/api/workspaces/${pemilik.workspaceId}/onboarding` })
    expect(anonim.statusCode).toBe(401)
  })
})
