import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import {
  registerVerifyAndLogin,
  tokenFromLastEmail,
  type CapturedEmail,
} from './account-helpers.ts'

/**
 * PRD 6.1 dan PRD 8: kontrak yang dipakai halaman profil usaha dan halaman
 * anggota. Halaman hanya menyembunyikan aksi yang tidak boleh; aturan sebenarnya
 * diperiksa di sini, bukan di tampilan.
 */

let db: Database
let app: FastifyInstance
let email: CapturedEmail

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({
    db,
    email,
    sessionSecret: 'rahasia-uji',
    origin: 'http://localhost:3000',
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

beforeEach(() => {
  email.messages.length = 0
})

interface RegisteredUser {
  userId: number
  email: string
  cookie: string
}

async function register(emailAddress: string, name = 'Pemilik Usaha'): Promise<RegisteredUser> {
  const cookie = await registerVerifyAndLogin(app, email, emailAddress, name)

  const sesi = await app.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: { cookie },
  })

  return { userId: sesi.json().user.id as number, email: emailAddress, cookie }
}

async function createWorkspace(user: RegisteredUser, name: string): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: { cookie: user.cookie },
    payload: { name, businessType: 'kedai kopi', timezone: 'Asia/Jakarta' },
  })
  expect(response.statusCode).toBe(201)
  return response.json().workspaceId as number
}

async function memberIdOf(workspaceId: number, cookie: string, emailAddress: string): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${workspaceId}/members`,
    headers: { cookie },
  })
  expect(response.statusCode).toBe(200)
  const row = response
    .json()
    .members.find((member: { email: string }) => member.email === emailAddress)
  expect(row, `anggota ${emailAddress} harus ada di daftar`).toBeDefined()
  return row.id as number
}

/** Undang lewat email, lalu terima sebagai pengguna yang emailnya cocok. */
async function inviteAndAccept(
  workspaceId: number,
  owner: RegisteredUser,
  undangan: RegisteredUser,
  role: 'admin' | 'purchasing' | 'staff' | 'viewer',
): Promise<void> {
  const sent = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/invitations`,
    headers: { cookie: owner.cookie },
    payload: { email: undangan.email, role },
  })
  expect(sent.statusCode, `undangan untuk ${undangan.email}`).toBe(201)
  expect(email.messages.at(-1)?.body).toContain('/undangan?token=')

  const accepted = await app.inject({
    method: 'POST',
    url: '/api/invitations/accept',
    headers: { cookie: undangan.cookie },
    payload: { token: tokenFromLastEmail(email) },
  })
  expect(accepted.statusCode, `penerimaan undangan ${undangan.email}`).toBe(200)
}

describe('profil usaha (PRD 6.1)', () => {
  it('menyimpan nama, jenis usaha, dan zona waktu lalu membacanya kembali', async () => {
    const pemilik = await register('pemilik.profil@contoh.test')
    const workspaceId = await createWorkspace(pemilik, 'Toko Awal')

    const disimpan = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: pemilik.cookie },
      payload: {
        name: 'Toko Baru',
        businessType: 'warung makan',
        timezone: 'Asia/Makassar',
      },
    })
    expect(disimpan.statusCode).toBe(200)

    const dibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: pemilik.cookie },
    })
    expect(dibaca.statusCode).toBe(200)
    expect(dibaca.json().workspace).toMatchObject({
      name: 'Toko Baru',
      businessType: 'warung makan',
      timezone: 'Asia/Makassar',
      currency: 'IDR',
    })

    // Kolom opsional harus bisa dikosongkan lagi, bukan hanya diisi.
    const dikosongkan = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: pemilik.cookie },
      payload: { businessType: null },
    })
    expect(dikosongkan.statusCode).toBe(200)

    const setelah = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: pemilik.cookie },
    })
    expect(setelah.json().workspace.businessType).toBeNull()
  })
})

describe('anggota dan peran (PRD 6.1, PRD 8)', () => {
  it('menerima undangan lewat tautan email dan menampilkan anggota baru', async () => {
    const pemilik = await register('pemilik.anggota@contoh.test')
    const workspaceId = await createWorkspace(pemilik, 'Toko Anggota')
    const staf = await register('staf.anggota@contoh.test', 'Staf Uji')

    await inviteAndAccept(workspaceId, pemilik, staf, 'staff')

    const members = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/members`,
      headers: { cookie: pemilik.cookie },
    })
    expect(members.statusCode).toBe(200)
    expect(members.json().members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'staf.anggota@contoh.test', role: 'staff' }),
      ]),
    )

    // Staf yang sudah diterima bisa membuka workspace-nya.
    const dibuka = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: staf.cookie },
    })
    expect(dibuka.statusCode).toBe(200)
  })

  it('menolak perubahan peran di luar kewenangan dan melindungi Owner', async () => {
    const pemilik = await register('pemilik.peran@contoh.test')
    const workspaceId = await createWorkspace(pemilik, 'Toko Peran')
    const admin = await register('admin.peran@contoh.test', 'Admin Uji')

    await inviteAndAccept(workspaceId, pemilik, admin, 'admin')

    const adminId = await memberIdOf(workspaceId, pemilik.cookie, admin.email)
    const ownerId = await memberIdOf(workspaceId, pemilik.cookie, pemilik.email)

    // B-01: Admin tidak boleh memberi peran Admin, termasuk ke dirinya sendiri.
    const adminNaik = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/members/${adminId}`,
      headers: { cookie: admin.cookie },
      payload: { role: 'admin' },
    })
    expect(adminNaik.statusCode).toBe(403)

    // Peran Owner tidak bisa diubah atau dikosongkan lewat halaman anggota.
    const ownerDiubah = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/members/${ownerId}`,
      headers: { cookie: pemilik.cookie },
      payload: { role: 'admin' },
    })
    expect(ownerDiubah.statusCode).toBe(403)

    const ownerDikeluarkan = await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/members/${ownerId}`,
      headers: { cookie: pemilik.cookie },
    })
    expect(ownerDikeluarkan.statusCode).toBe(403)
  })

  it('mengeluarkan anggota dan mencabut aksesnya ke workspace', async () => {
    const pemilik = await register('pemilik.keluar@contoh.test')
    const workspaceId = await createWorkspace(pemilik, 'Toko Keluar')
    const staf = await register('staf.keluar@contoh.test', 'Staf Keluar')

    await inviteAndAccept(workspaceId, pemilik, staf, 'staff')
    const stafId = await memberIdOf(workspaceId, pemilik.cookie, staf.email)

    const dikeluarkan = await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/members/${stafId}`,
      headers: { cookie: pemilik.cookie },
    })
    expect(dikeluarkan.statusCode).toBe(204)

    const setelah = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: staf.cookie },
    })
    expect(setelah.statusCode).toBe(403)

    const members = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/members`,
      headers: { cookie: pemilik.cookie },
    })
    const emails = members.json().members.map((member: { email: string }) => member.email)
    expect(emails).not.toContain(staf.email)
  })
})
