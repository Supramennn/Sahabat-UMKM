import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import {
  registerVerifyAndLogin,
  type CapturedEmail,
} from './account-helpers.ts'

/**
 * PRD 9: setiap query, pencarian, ekspor, impor, dan berkas menerapkan batas
 * workspace, dan tes otomatis wajib mencoba mengakses objek milik workspace lain
 * lalu harus gagal. Berkas ini adalah requirement itu.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

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

  return {
    userId: sesi.json().user.id as number,
    email: emailAddress,
    cookie,
  }
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

describe('IDOR, akses lintas workspace (PRD 9)', () => {
  it('menolak pembacaan profil workspace yang bukan milik pengguna', async () => {
    const korban = await register('korban@contoh.test')
    const penyerang = await register('penyerang@contoh.test', 'Penyerang')

    const workspaceId = await createWorkspace(korban, 'Kedai Korban')

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: penyerang.cookie },
    })

    // 403 bukan 404 dan bukan 200: pesannya sama untuk workspace yang tidak ada
    // dan workspace milik orang lain, jadi ID tidak bisa dipetakan.
    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Anda tidak punya akses ke workspace ini.')
    expect(response.body).not.toContain('Kedai Korban')
  })

  it('menolak pembacaan daftar anggota workspace lain', async () => {
    const korban = await register('korban2@contoh.test')
    const penyerang = await register('penyerang2@contoh.test')

    const workspaceId = await createWorkspace(korban, 'Toko Korban')
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/invitations`,
      headers: { cookie: korban.cookie },
      payload: { email: 'anggota@contoh.test', role: 'staff' },
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/members`,
      headers: { cookie: penyerang.cookie },
    })

    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('@contoh.test')
  })

  it('menolak perubahan profil workspace lain', async () => {
    const korban = await register('korban3@contoh.test')
    const penyerang = await register('penyerang3@contoh.test')

    const workspaceId = await createWorkspace(korban, 'Warung Korban')

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: penyerang.cookie },
      payload: { name: 'Nama Baru' },
    })

    expect(response.statusCode).toBe(403)

    const setelah = await db.query<{ name: string }>('select name from workspaces where id = $1', [
      workspaceId,
    ])
    expect(setelah.rows[0]!.name).toBe('Warung Korban')
  })

  it('menolak undangan ke workspace lain', async () => {
    const korban = await register('korban4@contoh.test')
    const penyerang = await register('penyerang4@contoh.test')

    const workspaceId = await createWorkspace(korban, 'Kafe Korban')

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/invitations`,
      headers: { cookie: penyerang.cookie },
      payload: { email: 'baru@contoh.test', role: 'staff' },
    })

    expect(response.statusCode).toBe(403)

    const invitations = await db.query(
      'select 1 from workspace_invitations where workspace_id = $1',
      [workspaceId],
    )
    expect(invitations.rows).toHaveLength(0)
  })

  it('menolak perubahan peran anggota di workspace lain', async () => {
    const owner = await register('owner5@contoh.test')
    const penyerang = await register('penyerang5@contoh.test')

    const workspaceId = await createWorkspace(owner, 'Toko Damascus')
    const invitation = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/invitations`,
      headers: { cookie: owner.cookie },
      payload: { email: 'staf5@contoh.test', role: 'staff' },
    })
    expect(invitation.statusCode).toBe(201)

    // Token diambil tepat setelah undangan dikirim. Email berikutnya adalah email
    // verifikasi pendaftaran staf, jadi mengambil email terakhir setelah register
    // akan salah mengambil pesan yang berbeda.
    const invitationMail = email.messages.at(-1)
    expect(invitationMail?.to).toBe('staf5@contoh.test')
    const token = invitationMail?.body.match(/: (\S+)\s*$/)?.[1]
    expect(token, 'isi email undangan harus memuat token').toBeDefined()

    const staf = await register('staf5@contoh.test')

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      headers: { cookie: staf.cookie },
      payload: { token: token ?? '' },
    })
    expect(accepted.statusCode, 'undangan harus diterima').toBe(200)

    const members = await db.query<{ id: number; role: string }>(
      "select id, role from memberships where workspace_id = $1 and user_id <> $2",
      [workspaceId, owner.userId],
    )
    expect(members.rows, 'anggota staf harus ada di workspace').toHaveLength(1)
    const stafMembership = members.rows[0]!

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/members/${stafMembership.id}`,
      headers: { cookie: penyerang.cookie },
      payload: { role: 'admin' },
    })

    expect(response.statusCode).toBe(403)

    const setelah = await db.query<{ role: string }>('select role from memberships where id = $1', [
      stafMembership.id,
    ])
    expect(setelah.rows[0]!.role).toBe('staff')
  })

  it('menolak pengiriman workspaceId asing saat masuk', async () => {
    const korban = await register('korban6@contoh.test')
    const penyerang = await register('penyerang6@contoh.test')

    const workspaceId = await createWorkspace(korban, 'Bengkel Korban')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: penyerang.email, password: PASSWORD, workspaceId },
    })

    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('Bengkel Korban')
  })

  it('menolak permintaan tanpa sesi', async () => {
    const owner = await register('tanpa-sesi@contoh.test')
    const workspaceId = await createWorkspace(owner, 'Apotek Tanpa Sesi')

    for (const url of [
      `/api/workspaces/${workspaceId}`,
      `/api/workspaces/${workspaceId}/members`,
      '/api/auth/session',
      '/api/auth/devices',
    ]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(401)
    }
  })

  it('memberi pesan yang sama untuk workspace tidak ada dan workspace milik orang lain', async () => {
    const penyerang = await register('penyerang7@contoh.test')
    const responseTidakAda = await app.inject({
      method: 'GET',
      url: '/api/workspaces/99999999',
      headers: { cookie: penyerang.cookie },
    })

    const korban = await register('korban7@contoh.test')
    const workspaceId = await createWorkspace(korban, 'Apotek Confidential')
    const responseMilikOrang = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie: penyerang.cookie },
    })

    expect(responseTidakAda.json().message).toBe(responseMilikOrang.json().message)
  })
})
