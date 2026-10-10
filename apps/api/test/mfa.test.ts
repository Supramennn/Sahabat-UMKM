import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import {
  cookieOf,
  registerVerifyAndLogin,
  type CapturedEmail,
} from './account-helpers.ts'
import { decryptSecret, encryptSecret, formatRecoveryCode } from '../src/auth/mfa.ts'
import { generate } from 'otplib'

/**
 * PRD 9: MFA tersedia untuk semua pengguna, diwajibkan untuk Owner dan Admin
 * pada 30 hari setelah akun dibuat, dan rahasia tidak boleh disimpan plaintext.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'
const ENCRYPTION_SECRET = 'kunci-uji-yang-cukup-panjang-1234567890'

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
    encryptionSecret: ENCRYPTION_SECRET,
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

async function registerAndVerify(emailAddress: string, name = 'Pemilik'): Promise<string> {
  return registerVerifyAndLogin(app, email, emailAddress, name)
}

/** Mundurkan tanggal akun supaya batas 30 hari sudah lewat (PRD 9). */
async function backdateAccount(emailAddress: string, days: number): Promise<void> {
  await db.query(
    `update users set created_at = now() - make_interval(days => $2) where email = $1`,
    [emailAddress, days],
  )
}

async function currentSecretFor(userId: number): Promise<string> {
  const row = await db.query<{ secret_encrypted: Uint8Array }>(
    'select secret_encrypted from mfa_secrets where user_id = $1',
    [userId],
  )
  return decryptSecret(row.rows[0]!.secret_encrypted, ENCRYPTION_SECRET)
}

async function userIdFor(emailAddress: string): Promise<number> {
  const row = await db.query<{ id: number }>('select id from users where email = $1', [emailAddress])
  return row.rows[0]!.id
}

/** Workspace dengan satu anggota, supaya kewajiban MFA punya tempat diuji. */
async function createWorkspaceWithRole(
  slug: string,
  name: string,
  userId: number,
  role: 'owner' | 'admin' | 'viewer',
): Promise<number> {
  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [slug, name, userId],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    userId,
    role,
  ])

  return workspaceId
}

async function enableMfa(cookie: string, userId: number): Promise<string[]> {
  const setup = await app.inject({ method: 'POST', url: '/api/auth/mfa/setup', headers: { cookie } })
  expect(setup.statusCode).toBe(200)

  // Kode dibuat dari rahasia yang tersimpan, bukan dari yang dikirim ke peramban.
  // Kalau keduanya berbeda, dekripsi salah dan konfirmasi akan selalu gagal.
  const storedSecret = await currentSecretFor(userId)
  expect(setup.json().secret).toBe(storedSecret)
  const token = await generate({ secret: storedSecret })

  const confirm = await app.inject({
    method: 'POST',
    url: '/api/auth/mfa/confirm',
    headers: { cookie },
    payload: { token },
  })
  expect(confirm.statusCode).toBe(200)
  return confirm.json().recoveryCodes as string[]
}

describe('menyiapkan MFA (PRD 9)', () => {
  it('menyerahkan rahasia dan URI provisioning', async () => {
    const cookie = await registerAndVerify('mfa-setup@contoh.test')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/setup',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(body.uri).toContain('otpauth://totp/')
    expect(body.uri).toContain('Sahabat%20UMKM')
  })

  it('menyimpan rahasia terenkripsi, bukan plaintext', async () => {
    const cookie = await registerAndVerify('mfa-enkripsi@contoh.test')
    const userId = await userIdFor('mfa-enkripsi@contoh.test')

    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/setup',
      headers: { cookie },
    })
    const revealed = setup.json().secret as string

    const row = await db.query<{ secret_encrypted: Uint8Array }>(
      'select secret_encrypted from mfa_secrets where user_id = $1',
      [userId],
    )
    const stored = row.rows[0]!.secret_encrypted

    expect(stored).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(stored).toString('utf8')).not.toContain(revealed)
    expect(Buffer.from(stored).includes(revealed)).toBe(false)
    // Dekripsi dengan kunci yang benar mengembalikan rahasia yang sama.
    expect(decryptSecret(stored, ENCRYPTION_SECRET)).toBe(revealed)
  })

  it('menolak konfirmasi dengan kode salah dan tidak mengaktifkan apa pun', async () => {
    const cookie = await registerAndVerify('mfa-salah@contoh.test')
    const userId = await userIdFor('mfa-salah@contoh.test')

    await app.inject({ method: 'POST', url: '/api/auth/mfa/setup', headers: { cookie } })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/confirm',
      headers: { cookie },
      payload: { token: '000000' },
    })

    expect(response.statusCode).toBe(400)

    const row = await db.query<{ confirmed_at: Date | null }>(
      'select confirmed_at from mfa_secrets where user_id = $1',
      [userId],
    )
    expect(row.rows[0]!.confirmed_at).toBeNull()
  })

  it('menolak konfirmasi tanpa memulai pengaturan lebih dulu', async () => {
    const cookie = await registerAndVerify('mfa-lewat@contoh.test')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/confirm',
      headers: { cookie },
      payload: { token: '123456' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('mfa_belum_dimulai')
  })

  it('menolak konfirmasi dengan kode yang bukan 6 angka', async () => {
    const cookie = await registerAndVerify('mfa-format@contoh.test')
    await app.inject({ method: 'POST', url: '/api/auth/mfa/setup', headers: { cookie } })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/confirm',
      headers: { cookie },
      payload: { token: 'abc' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('data_tidak_valid')
  })
})

describe('kode pemulihan (B-09)', () => {
  it('memberi delapan kode dan hanya menyimpan hash-nya', async () => {
    const cookie = await registerAndVerify('mfa-pemulihan@contoh.test')
    const userId = await userIdFor('mfa-pemulihan@contoh.test')

    const codes = await enableMfa(cookie, userId)
    expect(codes).toHaveLength(8)

    const rows = await db.query<{ code_hash: string }>(
      'select code_hash from mfa_recovery_codes where user_id = $1',
      [userId],
    )
    expect(rows.rows).toHaveLength(8)
    for (const code of codes) {
      const normalized = code.replace('-', '')
      expect(rows.rows.some((row) => row.code_hash.includes(normalized))).toBe(false)
    }
  })

  it('menampilkan kode dengan pemisah agar mudah dibaca dan diketik', async () => {
    const cookie = await registerAndVerify('mfa-format-kode@contoh.test')
    const userId = await userIdFor('mfa-format-kode@contoh.test')

    const codes = await enableMfa(cookie, userId)
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    }
  })

  it('membuat kode baru setelah kode lama dipakai sebagai bukti', async () => {
    const cookie = await registerAndVerify('mfa-tukar@contoh.test')
    const userId = await userIdFor('mfa-tukar@contoh.test')
    const codes = await enableMfa(cookie, userId)
    const secret = await currentSecretFor(userId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: { recoveryCode: codes[0] },
    })

    expect(response.statusCode).toBe(200)
    const fresh = response.json().recoveryCodes as string[]
    expect(fresh).toHaveLength(8)
    expect(fresh).not.toContain(codes[0])

    // Kode lama tidak berlaku lagi setelah kode baru diterbitkan.
    const lama = await db.query<{ code_hash: string }>(
      'select code_hash from mfa_recovery_codes where user_id = $1',
      [userId],
    )
    expect(lama.rows).toHaveLength(8)

    // Kode dari aplikasi autentikator juga sah sebagai bukti.
    const kedua = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: { token: await generate({ secret }) },
    })
    expect(kedua.statusCode).toBe(200)
  })

  it('menolak membuat kode baru tanpa bukti kepemilikan', async () => {
    const cookie = await registerAndVerify('mfa-tanpa-bukti@contoh.test')
    const userId = await userIdFor('mfa-tanpa-bukti@contoh.test')
    await enableMfa(cookie, userId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: {},
    })

    expect(response.statusCode).toBe(401)

    const codes = await db.query('select 1 from mfa_recovery_codes where user_id = $1', [userId])
    expect(codes.rows).toHaveLength(8)
  })

  it('menolak kode pemulihan yang sudah dipakai', async () => {
    const cookie = await registerAndVerify('mfa-pakai@contoh.test')
    const userId = await userIdFor('mfa-pakai@contoh.test')
    const codes = await enableMfa(cookie, userId)

    const pertama = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: { recoveryCode: codes[0] },
    })
    expect(pertama.statusCode).toBe(200)

    // Kode itu sudah hangus, jadi tidak sah lagi sebagai bukti.
    const kedua = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: { recoveryCode: codes[0] },
    })

    expect(kedua.statusCode).toBe(401)
  })

  it('menolak kode pemulihan yang tidak dikenal', async () => {
    const cookie = await registerAndVerify('mfa-asing@contoh.test')
    const userId = await userIdFor('mfa-asing@contoh.test')
    await enableMfa(cookie, userId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/recovery-codes',
      headers: { cookie },
      payload: { recoveryCode: formatRecoveryCode('ZZZZZ-ZZZZZ') },
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('MFA saat masuk (PRD 9)', () => {
  it('meminta kode kedua dan tidak memberi akses sebelum kode diberikan', async () => {
    const emailAddress = 'mfa-masuk@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })

    expect(login.statusCode).toBe(200)
    expect(login.json().mfaRequired).toBe(true)

    const pending = cookieOf(login)
    const beforeVerify = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: pending },
    })
    expect(beforeVerify.statusCode).toBe(200)
    expect(beforeVerify.json().mfaSatisfied).toBe(false)
  })

  it('meloloskan sesi setelah kode yang benar', async () => {
    const emailAddress = 'mfa-sukses@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)
    const secret = await currentSecretFor(userId)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })
    const pending = cookieOf(login)
    const token = await generate({ secret })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: pending },
      payload: { token },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().verified).toBe(true)

    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookieOf(response) },
    })
    expect(after.statusCode).toBe(200)
    expect(after.json().mfaSatisfied).toBe(true)
  })

  it('memutar ulang sesi setelah MFA, jadi token lama tidak berlaku', async () => {
    const emailAddress = 'mfa-rotasi@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)
    const secret = await currentSecretFor(userId)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })
    const pending = cookieOf(login)
    const token = await generate({ secret })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: pending },
      payload: { token },
    })

    const withOldToken = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: pending },
    })
    expect(withOldToken.statusCode).toBe(401)
    expect(cookieOf(response)).not.toBe(pending)
  })

  it('menolak kode yang salah dan mencatatnya sebagai denied', async () => {
    const emailAddress = 'mfa-tolak@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: cookieOf(login) },
      payload: { token: '000000' },
    })

    expect(response.statusCode).toBe(401)

    const denied = await db.query<{ result: string }>(
      "select result from audit_logs where action = 'mfa.verify_failed' order by created_at desc limit 1",
    )
    expect(denied.rows[0]!.result).toBe('denied')
  })

  it('meloloskan sesi lewat kode pemulihan', async () => {
    const emailAddress = 'mfa-pemulihan-masuk@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    const codes = await enableMfa(cookie, userId)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: cookieOf(login) },
      payload: { token: '000000', recoveryCode: codes[0] },
    })

    expect(response.statusCode).toBe(200)

    const used = await db.query<{ used_at: Date | null }>(
      'select used_at from mfa_recovery_codes where user_id = $1',
      [userId],
    )
    expect(used.rows.filter((row) => row.used_at !== null)).toHaveLength(1)
  })
})

describe('menonaktifkan MFA', () => {
  it('menolak tanpa kode yang sah', async () => {
    const emailAddress = 'mfa-nonaktif@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/disable',
      headers: { cookie },
      payload: {},
    })

    expect(response.statusCode).toBe(401)

    const still = await db.query<{ confirmed_at: Date | null }>(
      'select confirmed_at from mfa_secrets where user_id = $1',
      [userId],
    )
    expect(still.rows[0]!.confirmed_at).not.toBeNull()
  })

  it('menerima kode dari aplikasi autentikator', async () => {
    const emailAddress = 'mfa-nonaktif-berhasil@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await enableMfa(cookie, userId)
    const secret = await currentSecretFor(userId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/disable',
      headers: { cookie },
      payload: { token: await generate({ secret }) },
    })

    expect(response.statusCode).toBe(200)

    const gone = await db.query('select 1 from mfa_secrets where user_id = $1', [userId])
    expect(gone.rows).toHaveLength(0)
  })
})

describe('status MFA dan kewajiban 30 hari (PRD 9)', () => {
  it('melaporkan belum wajib untuk Owner baru', async () => {
    const cookie = await registerAndVerify('mfa-owner-baru@contoh.test')
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/mfa/status',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().enabled).toBe(false)
    expect(response.json().mandatory).toBe(false)
    expect(response.json().blocked).toBe(false)
  })

  it('melaporkan wajib setelah Owner 30 hari', async () => {
    const emailAddress = 'mfa-owner-lama@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)

    await createWorkspaceWithRole('mfa-owner-lama', 'Toko MFA Lama', userId, 'owner')
    await backdateAccount(emailAddress, 31)

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/mfa/status',
      headers: { cookie },
    })

    expect(response.json().mandatory).toBe(true)
    expect(response.json().blocked).toBe(true)
  })

  it('tidak mewajibkan Viewer meski akunnya sudah lama', async () => {
    const emailAddress = 'mfa-viewer@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)

    await createWorkspaceWithRole('mfa-viewer', 'Toko MFA Viewer', userId, 'viewer')
    await backdateAccount(emailAddress, 400)

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/mfa/status',
      headers: { cookie },
    })

    expect(response.json().mandatory).toBe(false)
    expect(response.json().blocked).toBe(false)
  })
})

describe('penegakan kewajiban MFA di server (PRD 9)', () => {
  it('menolak akses data workspace sampai MFA aktif', async () => {
    const emailAddress = 'mfa-tegakan@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)

    const workspaceId = await createWorkspaceWithRole('mfa-tegakan', 'Toko Wajib MFA', userId, 'owner')

    // Sebelum 30 hari, workspace boleh dibuka.
    const sebelum = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie },
    })
    expect(sebelum.statusCode).toBe(200)

    await backdateAccount(emailAddress, 31)

    const sesudah = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie },
    })
    expect(sesudah.statusCode).toBe(403)
    expect(sesudah.json().error).toBe('mfa_wajib_aktif')
  })

  it('tetap membuka pengaturan akun supaya MFA bisa diaktifkan', async () => {
    const emailAddress = 'mfa-activate@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    await backdateAccount(emailAddress, 31)

    const sesi = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    })
    expect(sesi.statusCode).toBe(200)

    const mulai = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/setup',
      headers: { cookie },
    })
    expect(mulai.statusCode).toBe(200)
  })

  it('melepas kunci workspace setelah MFA aktif', async () => {
    const emailAddress = 'mfa-lepas@contoh.test'
    const cookie = await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    const workspaceId = await createWorkspaceWithRole('mfa-lepas', 'Toko Lepas Kunci', userId, 'owner')

    await backdateAccount(emailAddress, 31)

    const terkunci = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie },
    })
    expect(terkunci.statusCode).toBe(403)

    await enableMfa(cookie, userId)

    const terbuka = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}`,
      headers: { cookie },
    })
    expect(terbuka.statusCode).toBe(200)
  })

  it('memberi tahu halaman masuk saat MFA sudah menjadi kewajiban', async () => {
    const emailAddress = 'mfa-flag@contoh.test'
    await registerAndVerify(emailAddress)
    const userId = await userIdFor(emailAddress)
    await createWorkspaceWithRole('mfa-flag', 'Toko Flag', userId, 'owner')
    await backdateAccount(emailAddress, 31)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailAddress, password: PASSWORD },
    })

    expect(login.statusCode).toBe(200)
    expect(login.json().mfaSetupRequired).toBe(true)
  })
})

describe('enkripsi rahasia (PRD 9)', () => {
  it('tidak dapat mendekripsi dengan kunci yang salah', () => {
    const encrypted = encryptSecret('RAHASIA-TEST', ENCRYPTION_SECRET)
    expect(() => decryptSecret(encrypted, 'kunci-yang-berbeda')).toThrow()
  })

  it('menghasilkan ciphertext berbeda untuk teks yang sama', () => {
    const a = encryptSecret('RAHASIA-TEST', ENCRYPTION_SECRET)
    const b = encryptSecret('RAHASIA-TEST', ENCRYPTION_SECRET)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
    expect(decryptSecret(a, ENCRYPTION_SECRET)).toBe(decryptSecret(b, ENCRYPTION_SECRET))
  })
})
