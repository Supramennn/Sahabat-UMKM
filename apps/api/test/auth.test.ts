import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider, type EmailProvider } from '../src/services/email.ts'
import { hashPassword, checkPasswordPolicy, MINIMUM_PASSWORD_LENGTH } from '../src/auth/password.ts'
import { generateToken, hashToken, tokenMatches } from '../src/auth/token.ts'

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance
let email: EmailProvider & { messages: { to: string; subject: string; body: string }[] }

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

beforeEach(() => {
  email.messages.length = 0
})

/**
 * Token undangan dan atur ulang dikirim lewat email. Dalam produksi email itu
 * benar-benar terkirim; di sini isi email ditahan di memori oleh penyedia uji, dan
 * token diambil darinya. Kegagalan berarti ada bug, jadi ia dilempar, bukan
 * diteruskan sebagai undefined.
 */
function tokenFromLastEmail(): string {
  const message = email.messages.at(-1)
  if (!message) {
    throw new Error('Tidak ada email yang dikirim pada langkah ini.')
  }
  const token = message.body.match(/: (\S+)\s*$/)?.[1]
  if (!token) {
    throw new Error(`Email tidak memuat token: ${message.body}`)
  }
  return token
}

function cookieOf(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie']
  const raw = Array.isArray(header) ? header[0] : header
  return String(raw).split(';')[0] ?? ''
}

async function registerAndVerify(emailAddress: string, name = 'Pemilik'): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: emailAddress, password: PASSWORD, name },
  })
  await db.query('update users set email_verified_at = now() where email = $1', [emailAddress])
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: emailAddress, password: PASSWORD },
  })
  expect(login.statusCode).toBe(200)
  return cookieOf(login)
}

describe('Argon2id dan kebijakan kata sandi (PRD 9)', () => {
  it('menyimpan hash Argon2id, bukan kata sandi', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'argon@contoh.test', password: PASSWORD, name: 'Argon' },
    })

    const row = await db.query<{ password_hash: string }>(
      'select password_hash from users where email = $1',
      ['argon@contoh.test'],
    )
    expect(row.rows[0]!.password_hash).toMatch(/^\$argon2id\$/)
    expect(row.rows[0]!.password_hash).not.toContain(PASSWORD)
  })

  it('menolak kata sandi yang sudah bocor meski panjangnya cukup', async () => {
    // Panjangnya 13 karakter, jadi lolos aturan panjang dan ditolak oleh
    // pemeriksaan daftar yang sudah bocor. Pemeriksaan dua-duanya harus berjalan.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'lemah@contoh.test', password: 'qwertyuiop123', name: 'Lemah' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('kata_sandi_lemah')
  })

  it('menolak kata sandi yang hanya berisi satu karakter berulang', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ulangan@contoh.test', password: 'aaaaaaaaaaaaaaaa', name: 'Ulangan' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('kata_sandi_lemah')
  })

  it('menolak kata sandi pendek dengan pesan yang menyebut syaratnya', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'pendek@contoh.test', password: 'pendek123', name: 'Pendek' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.body).toContain(String(MINIMUM_PASSWORD_LENGTH))
  })

  it('menyusun kebijakan tanpa aturan komposisi yang mendorong pola lemah', () => {
    const hasil = checkPasswordPolicy('aaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(hasil.ok).toBe(true)

    const pendek = checkPasswordPolicy('Pendek1!')
    expect(pendek.ok).toBe(false)
  })

  it('memverifikasi hash yang benar dan menolak yang salah', async () => {
    const hash = await hashPassword('kata-sandi-uji-123')
    const { verifyPassword } = await import('../src/auth/password.ts')
    expect(await verifyPassword(hash, 'kata-sandi-uji-123')).toBe(true)
    expect(await verifyPassword(hash, 'kata-sandi-uji-124')).toBe(false)
  })

  it('menolak hash yang rusak tanpa melempar galat', async () => {
    const { verifyPassword } = await import('../src/auth/password.ts')
    expect(await verifyPassword('bukan-hash', 'apa saja')).toBe(false)
  })
})

describe('token hanya disimpan sebagai hash (PRD 9)', () => {
  it('tidak menyimpan token mentah di database', async () => {
    const cookie = await registerAndVerify('token@contoh.test')
    const rawToken = cookie.split('=')[1]!

    const row = await db.query<{ token_hash: string }>('select token_hash from sessions order by created_at desc limit 1')
    expect(row.rows[0]!.token_hash).toBe(hashToken(rawToken))
    expect(row.rows[0]!.token_hash).not.toBe(rawToken)
  })

  it('membandingkan token dengan waktu tetap', () => {
    const token = generateToken()
    expect(tokenMatches(hashToken(token), token)).toBe(true)
    expect(tokenMatches(hashToken(token), generateToken())).toBe(false)
    expect(tokenMatches(hashToken(token), 'pendek')).toBe(false)
  })

  it('menghasilkan token berbeda setiap kali', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()))
    expect(tokens.size).toBe(50)
  })
})

describe('pendaftaran dan verifikasi email (PRD 6.1)', () => {
  it('menolak email tidak valid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bukan-email', password: PASSWORD, name: 'X' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('data_tidak_valid')
  })

  it('memberi jawaban sama untuk email yang sudah dipakai', async () => {
    await registerAndVerify('duplikat@contoh.test')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'duplikat@contoh.test', password: PASSWORD, name: 'Duplikat' },
    })

    // 202, bukan 409, supaya email terdaftar tidak bisa dipetakan.
    expect(response.statusCode).toBe(202)
    expect(response.json().message).toContain('Jika email itu bisa dipakai')
  })

  it('menormalkan email menjadi huruf kecil', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Besar@Contoh.TEST', password: PASSWORD, name: 'Besar' },
    })
    const row = await db.query<{ email: string }>('select email from users where email = $1', [
      'besar@contoh.test',
    ])
    expect(row.rows).toHaveLength(1)
  })

  it('menolak masuk sebelum email diverifikasi', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'belum@contoh.test', password: PASSWORD, name: 'Belum' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'belum@contoh.test', password: PASSWORD },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error).toBe('email_belum_diverifikasi')
  })

  it('menggagalkan semua email yang belum diverifikasi saat email salah', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'salah@contoh.test', password: PASSWORD, name: 'Salah' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'salah@contoh.test', password: 'kata-sandi-yang-salah-123' },
    })

    // Kredensial salah, bukan email belum diverifikasi, supaya urutan pemeriksaan
    // tidak membocorkan apakah akun ada.
    expect(response.statusCode).toBe(401)
    expect(response.json().error).toBe('kredensial_salah')
  })
})

describe('masuk dan pembatasan percobaan (PRD 9)', () => {
  it('menolak kata sandi salah', async () => {
    const cookie = await registerAndVerify('masuk@contoh.test')
    expect(cookie).toContain('sahabat_session')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'masuk@contoh.test', password: 'kata-sandi-salah-2026' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('membatasi percobaan per akun setelah lima kali gagal', async () => {
    await registerAndVerify('limit@contoh.test')

    let eventuallyBlocked = false
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'limit@contoh.test', password: 'kata-sandi-salah-2026' },
      })
      if (response.statusCode === 429) {
        eventuallyBlocked = true
        break
      }
    }

    expect(eventuallyBlocked).toBe(true)
  })

  it('mencatat percobaan masuk untuk pemantauan', async () => {
    await registerAndVerify('catat@contoh.test')

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'catat@contoh.test', password: 'kata-sandi-salah-2026' },
    })

    const attempts = await db.query<{ count: number }>(
      'select count(*)::int as count from login_attempts where successful = false',
    )
    expect(attempts.rows[0]!.count).toBeGreaterThan(0)
  })

  it('menetapkan cookie HttpOnly, SameSite, dan Path di localhost', async () => {
    await registerAndVerify('cookie@contoh.test')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'cookie@contoh.test', password: PASSWORD },
    })

    expect(response.statusCode).toBe(200)
    const header = response.headers['set-cookie']
    const raw = Array.isArray(header) ? header[0] : header
    expect(raw).toContain('HttpOnly')
    expect(raw).toContain('SameSite=Lax')
    expect(raw).toContain('Path=/')
    // Secure tidak boleh ada di localhost, karena cookie dengan Secure tidak
    // akan terkirim dan pengguna lokal akan selalu keluar dari sesi.
    expect(raw).not.toContain('Secure')
  })
})

describe('cookie Secure saat produksi (PRD 9)', () => {
  it('menambahkan Secure ketika aplikasi berjalan di belakang HTTPS', async () => {
    const secureApp = await buildApp({
      db,
      email: createCapturingEmailProvider(),
      sessionSecret: 'rahasia-uji',
      origin: 'http://localhost:3000',
      secureCookies: true,
    })
    await secureApp.ready()

    await secureApp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'secure@contoh.test', password: PASSWORD, name: 'Secure' },
    })
    await db.query('update users set email_verified_at = now() where email = $1', [
      'secure@contoh.test',
    ])

    const response = await secureApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'secure@contoh.test', password: PASSWORD },
    })

    const header = response.headers['set-cookie']
    const raw = Array.isArray(header) ? header[0] : header
    expect(raw).toContain('Secure')
    expect(raw).toContain('HttpOnly')
    await secureApp.close()
  })
})

describe('memutar ulang sesi (PRD 9)', () => {
  it('menerbitkan token berbeda untuk permintaan berikutnya', async () => {
    const cookie = await registerAndVerify('rotasi@contoh.test')
    const first = cookie.split('=')[1]

    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: PASSWORD, newPassword: 'kata-sandi-baru-2026-yang-panjang' },
    })
    expect(change.statusCode).toBe(200)

    const newCookie = cookieOf(change)
    const second = newCookie.split('=')[1]
    expect(second).not.toBe(first)

    // Token lama harus mati sekarang.
    const denganTokenLama = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    })
    expect(denganTokenLama.statusCode).toBe(401)
  })
})

describe('ubah kata sandi (PRD 6.1)', () => {
  it('menolak kata sandi lama yang salah', async () => {
    const cookie = await registerAndVerify('ganti@contoh.test')
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: 'kata-sandi-lama-salah-2026', newPassword: 'kata-sandi-baru-2026-panjang' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('menolak memakai ulang kata sandi sebelumnya', async () => {
    const cookie = await registerAndVerify('reuse@contoh.test')
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: PASSWORD, newPassword: PASSWORD },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('kata_sandi_dipakai')
  })

  it('mencabut semua sesi lain setelah penggantian', async () => {
    const cookie = await registerAndVerify('multi@contoh.test')

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'multi@contoh.test', password: PASSWORD },
    })
    const secondCookie = cookieOf(second)

    await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: PASSWORD, newPassword: 'kata-sandi-baru-2026-panjang' },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: secondCookie },
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('atur ulang kata sandi (PRD 9)', () => {
  it('memberi respons sama apakah email terdaftar atau tidak', async () => {
    await registerAndVerify('ada@contoh.test')

    const terdaftar = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'ada@contoh.test' },
    })
    const tidakTerdaftar = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'tidak-ada@contoh.test' },
    })

    expect(terdaftar.statusCode).toBe(tidakTerdaftar.statusCode)
    expect(terdaftar.json()).toEqual(tidakTerdaftar.json())
  })

  it('hanya mengirim email untuk alamat yang terdaftar', async () => {
    await registerAndVerify('kirim@contoh.test')
    email.messages.length = 0

    await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'kirim@contoh.test' } })
    expect(email.messages).toHaveLength(1)

    email.messages.length = 0
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'entah@contoh.test' },
    })
    expect(email.messages).toHaveLength(0)
  })

  it('menolak token yang tidak dikenal', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: generateToken(), password: 'kata-sandi-baru-2026-panjang' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('token_tidak_valid')
  })

  it('menolak token yang sudah dipakai', async () => {
    await registerAndVerify('sekali@contoh.test')

    await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'sekali@contoh.test' } })
    const token = tokenFromLastEmail()

    const pertama = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'kata-sandi-baru-2026-panjang' },
    })
    expect(pertama.statusCode).toBe(200)

    const kedua = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'kata-sandi-lain-2026-panjang' },
    })
    expect(kedua.statusCode).toBe(400)
  })

  it('mencabut semua sesi setelah atur ulang berhasil', async () => {
    const cookie = await registerAndVerify('cabut@contoh.test')

    await app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'cabut@contoh.test' } })
    const token = tokenFromLastEmail()

    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'kata-sandi-baru-2026-panjang' },
    })

    const response = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })
    expect(response.statusCode).toBe(401)
  })

  it('menolak kata sandi lemah saat atur ulang', async () => {
    await registerAndVerify('lemah-reset@contoh.test')
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'lemah-reset@contoh.test' },
    })
    const token = tokenFromLastEmail()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'qwertyuiop123' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('kata_sandi_lemah')
  })
})

describe('perangkat dan sesi aktif (PRD 6.1)', () => {
  it('menampilkan perangkat beserta label yang bisa dibaca', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'perangkat@contoh.test', password: PASSWORD, name: 'Perangkat' },
    })
    expect(response.statusCode).toBe(201)
    await db.query('update users set email_verified_at = now() where email = $1', [
      'perangkat@contoh.test',
    ])

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'perangkat@contoh.test', password: PASSWORD },
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' },
    })

    const devices = await app.inject({
      method: 'GET',
      url: '/api/auth/devices',
      headers: { cookie: cookieOf(login) },
    })

    expect(devices.statusCode).toBe(200)
    expect(devices.json().devices.length).toBeGreaterThanOrEqual(1)
    expect(devices.json().devices[0].label).toContain('Chrome')
  })

  it('mencabut sesi lain tapi mempertahankan sesi saat ini', async () => {
    const cookie = await registerAndVerify('revoke@contoh.test')

    const lain = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'revoke@contoh.test', password: PASSWORD },
    })
    const lainCookie = cookieOf(lain)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/devices/revoke-others',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)

    const sesiIni = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })
    expect(sesiIni.statusCode).toBe(200)

    const sesiLain = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: lainCookie } })
    expect(sesiLain.statusCode).toBe(401)
  })
})

describe('audit log tidak membocorkan rahasia (PRD 9)', () => {
  it('tidak menulis kata sandi maupun token ke audit log', async () => {
    await registerAndVerify('audit@contoh.test')

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'audit@contoh.test', password: 'kata-sandi-salah-2026' },
    })

    const logs = await db.query<{ action: string; metadata: Record<string, unknown> }>(
      "select action, metadata from audit_logs where action like 'auth.%'",
    )
    const serialized = JSON.stringify(logs.rows)
    expect(serialized).not.toContain(PASSWORD)
    expect(serialized).not.toContain('kata-sandi-salah')
  })

  it('mencatat percobaan masuk gagal sebagai denied', async () => {
    await registerAndVerify('denied@contoh.test')

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'denied@contoh.test', password: 'kata-sandi-salah-2026' },
    })

    const denied = await db.query<{ result: string }>(
      "select result from audit_logs where action = 'auth.login_failed' order by created_at desc limit 1",
    )
    expect(denied.rows[0]!.result).toBe('denied')
  })
})

describe('sesi tidak bisa dipalsukan', () => {
  it('menolak token buatan sendiri', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `sahabat_session=${generateToken()}` },
    })
    expect(response.statusCode).toBe(401)
  })

  it('menolak cookie kosong', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: 'sahabat_session=' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('tidak menerima ID pengguna dari badan permintaan', async () => {
    const cookie = await registerAndVerify('spoof@contoh.test')
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-email',
      headers: { cookie },
      payload: { currentPassword: PASSWORD, newEmail: 'spoof-target@contoh.test', userId: 1 },
    })
    expect(response.statusCode).toBe(200)

    const changed = await db.query<{ email: string }>('select email from users where email = $1', [
      'spoof-target@contoh.test',
    ])
    expect(changed.rows).toHaveLength(1)
  })
})
