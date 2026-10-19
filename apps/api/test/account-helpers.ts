import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import type { EmailProvider } from '../src/services/email.ts'

/**
 * Pendaftaran dan verifikasi email diuji lewat endpoint yang sama dengan yang
 * dipakai pengguna. Database tidak pernah ditulis langsung untuk menandai email
 * terverifikasi, karena cara lama itu menyembunyikan endpoint verifikasi yang
 * hilang sama sekali: PRD 6.1 tidak bisa dianggap terpenuhi selama itu dilewati.
 */

export type CapturedEmail = EmailProvider & { messages: { to: string; subject: string; body: string }[] }

export const TEST_PASSWORD = 'kata-sandi-pengujian-2026'

export function cookieOf(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie']
  const raw = Array.isArray(header) ? header[0] : header
  return String(raw).split(';')[0] ?? ''
}

/**
 * Ambil token dari email terakhir. Verifikasi email, atur ulang kata sandi, dan
 * undangan semuanya memakai tautan dengan parameter token.
 */
export function tokenFromLastEmail(email: CapturedEmail): string {
  const message = email.messages.at(-1)
  if (!message) {
    throw new Error('Tidak ada email yang dikirim pada langkah ini.')
  }

  const dariTautan = message.body.match(/[?&]token=([A-Za-z0-9_-]+)/)
  if (dariTautan?.[1]) {
    return dariTautan[1]
  }

  const dariLabel = message.body.match(/: ([A-Za-z0-9_-]{20,})\s*$/)
  if (!dariLabel?.[1]) {
    throw new Error(`Email tidak memuat token: ${message.body}`)
  }
  return dariLabel[1]
}

export async function register(
  app: FastifyInstance,
  emailAddress: string,
  name = 'Pemilik',
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: emailAddress, password: TEST_PASSWORD, name },
  })
  if (response.statusCode !== 201 && response.statusCode !== 202) {
    throw new Error(`Pendaftaran gagal: ${response.statusCode} ${response.body}`)
  }
}

/** Daftar, verifikasi lewat email, lalu masuk. Mengembalikan cookie sesi. */
export async function registerVerifyAndLogin(
  app: FastifyInstance,
  email: CapturedEmail,
  emailAddress: string,
  name = 'Pemilik',
): Promise<string> {
  email.messages.length = 0
  await register(app, emailAddress, name)

  const token = tokenFromLastEmail(email)

  const verifikasi = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-email',
    payload: { token },
  })
  if (verifikasi.statusCode !== 200) {
    throw new Error(`Verifikasi email gagal: ${verifikasi.statusCode} ${verifikasi.body}`)
  }

  return login(app, emailAddress)
}

export async function login(app: FastifyInstance, emailAddress: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: emailAddress, password: TEST_PASSWORD },
  })
  if (response.statusCode !== 200) {
    throw new Error(`Masuk gagal: ${response.statusCode} ${response.body}`)
  }
  return cookieOf(response)
}
