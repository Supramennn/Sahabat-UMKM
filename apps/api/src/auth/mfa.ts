import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { generateSecret, generateURI, verify } from 'otplib'

/**
 * PRD 9: MFA tersedia untuk semua pengguna dan diwajibkan untuk Owner dan
 * Admin pada 30 hari setelah akun dibuat.
 *
 * Rahasia TOTP disimpan terenkripsi, bukan plaintext. Kuncinya dibaca dari
 * environment, sama seperti SESSION_SECRET, dan tidak pernah ada di repositori
 * (PRD 9). Tanpa kunci itu, rahasia yang bocor dari backup database tidak
 * langsung cukup untuk membuat kode MFA.
 *
 * Kode pemulihan menjaga Owner dan Admin tidak terkunci dari akunnya sendiri (B-09).
 */

const SECRET_BYTES = 20
const DIGITS = 6
const PERIOD_SECONDS = 30
/** Toleransi satu langkah ke depan dan ke belakang untuk mengoreksi selisih jam. */
const EPOCH_TOLERANCE = 1

export const ISSUER = 'Sahabat UMKM'

function encryptionKey(secret: string): Buffer {
  // Kunci harus 32 byte untuk AES-256. SHA-256 dari rahasia memberi panjang
  // tetap tanpa menuntut format tertentu dari operator.
  return createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptSecret(plaintext: string, encryptionSecret: string): Uint8Array {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(encryptionSecret), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // IV dan tag ikut disimpan, karena keduanya dibutuhkan untuk mendekripsi dan
  // keduanya bukan rahasia.
  return Buffer.concat([iv, tag, encrypted])
}

export function decryptSecret(payload: Uint8Array, encryptionSecret: string): string {
  // PGlite mengembalikan bytea sebagai Uint8Array dan node-postgres sebagai
  // Buffer. Keduanya punya subarray, jadi keduanya diterima tanpa konversi.
  const iv = Buffer.from(payload.subarray(0, 12))
  const tag = Buffer.from(payload.subarray(12, 28))
  const encrypted = Buffer.from(payload.subarray(28))
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encryptionSecret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function newMfaSecret(): string {
  return generateSecret({ length: SECRET_BYTES })
}

export function provisioningUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret })
}

export interface MfaVerifyResult {
  valid: boolean
}

/**
 * Verifikasi satu kode. `epochTolerance` menerima satu langkah ke depan dan ke
 * belakang, karena jam perangkat sering berbeda beberapa detik dari server.
 */
export async function verifyMfaToken(secret: string, token: string): Promise<MfaVerifyResult> {
  const trimmed = token.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false }
  }

  const result = await verify({
    secret,
    token: trimmed,
    period: PERIOD_SECONDS,
    // Toleransi satu langkah ke depan dan ke belakang. Jam perangkat sering
    // berbeda beberapa detik dari server, dan menolak kode yang masih valid
    // membuat orang berulang kali mencoba.
    epochTolerance: EPOCH_TOLERANCE * PERIOD_SECONDS,
  })
  return { valid: result.valid }
}

/**
 * Menyamakan bentuk kode pemulihan sebelum dibandingkan. Kode ditampilkan dengan
 * pemisah agar mudah dibaca dan diketik, jadi bentuk yang diterima pengguna
 * mungkin memakai spasi, tanda hubung, atau huruf kecil.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]+/g, '')
}

export function formatRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code)
  return normalized.length === 10
    ? `${normalized.slice(0, 5)}-${normalized.slice(5)}`
    : normalized
}

export { DIGITS, PERIOD_SECONDS }
