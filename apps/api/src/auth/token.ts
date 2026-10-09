import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * PRD 9: hanya hash token yang disimpan. Token session, verifikasi email, reset
 * password, undangan, dan kode pemulihan tidak pernah menyentuh database dalam
 * bentuk mentah.
 *
 * SHA-256 dipakai untuk token acak 32 byte, bukan Argon2id. Argon2id ada
 * untuk memperlambat tebak-tebakan password yang bisa ditebak manusia,
 * sedangkan token di sini sudah punya 256 bit entropi sehingga tidak bisa
 * ditebak sama sekali, dan lookup harus bisa lewat indeks database.
 */

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function tokenMatches(storedHash: string, presentedToken: string): boolean {
  const candidate = Buffer.from(hashToken(presentedToken), 'hex')
  const stored = Buffer.from(storedHash, 'hex')

  // Panjang yang berbeda tidak bisa dibandingkan, jadi tolak lebih dulu tanpa
  // membocorkan informasi lewat waktu.
  if (candidate.length !== stored.length) {
    return false
  }
  return timingSafeEqual(candidate, stored)
}

/** Hash untuk pencarian, misalnya membandingkan email pada batas percobaan masuk. */
export function hashForLookup(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase(), 'utf8').digest('hex')
}
