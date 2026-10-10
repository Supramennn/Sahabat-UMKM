import { randomBytes } from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

/**
 * PRD 9 mewajibkan Argon2id. Parameter mengikuti Panduan OWASP: m=19456 KiB,
 * t=2, p=1 adalah konfigurasi minimum yang direkomendasikan, dan nilai-nilai
 * itu disimpan di dalam hash, jadi parameter dapat dinaikkan tanpa memaksa
 * pengguna membuat kata sandi baru.
 *
 * Nilai 2 diambil dari `Algorithm.Argon2id` paket @node-rs/argon2, yang dicatat di
 * sini sebagai angka biasa karena enum konstan dari modul luar tidak bisa
 * diakses ketika verbatimModuleSyntax menyala. Angka yang salah akan diam-diam
 * memakai Argon2i atau Argon2d, jadi nilainya diverifikasi oleh tes.
 */
const ARGON2ID = 2

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, OPTIONS)
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, plain)
  } catch {
    // Hash yang rusak atau memakai algoritma lain dianggap gagal, bukan galat.
    return false
  }
}

/**
 * Mengembalikan indeks hash yang cocok, atau -1 bila tidak ada yang cocok.
 *
 * Semua hash yang diberikan tetap diperiksa, bukan berhenti di yang pertama,
 * supaya lama verifikasi tidak bergantung pada posisi hash yang cocok (PRD 9).
 *
 * Nilai dikembalikan sebagai indeks, bukan boolean, karena pemanggil perlu
 * membedakan "tidak cocok" dari "cocok di posisi pertama". Indeks 0 bernilai
 * falsy, jadi pemanggil tidak boleh memakai hasilnya langsung sebagai kondisi.
 */
export async function passwordMatchesAny(hashes: readonly string[], plain: string): Promise<number> {
  let matched = -1
  for (const [index, candidate] of hashes.entries()) {
    const matches = await verifyPassword(candidate, plain)
    if (matches && matched === -1) {
      matched = index
    }
  }
  return matched
}

/**
 * Hash nyata dari nilai acak, dipakai saat email tidak ditemukan supaya jalur
 * tersebut tetap membayar biaya Argon2id yang sama dengan akun yang ada.
 *
 * Hash yang diketik tangan pasti gagal diurai sebelum Argon2 dijalankan, jadi
 * jalur email tak dikenal selesai dalam mikrodetik sementara akun yang ada
 * membutuhkan puluhan milidetik. Selisih itu cukup untuk memetakan email yang
 * terdaftar (PRD 9).
 *
 * Nilainya dihitung sekali lalu disimpan, karena hash-nya tidak pernah dipakai
 * sebagai kata sandi siapa pun.
 */
let dummyHash: Promise<string> | null = null

export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'))
  return dummyHash
}

export interface PasswordPolicyResult {
  ok: boolean
  problems: string[]
}

/**
 * PRD 9 dan 10: kata sandi minimal 12 karakter. Panjang adalah syarat yang bisa
  dibuktikan pengguna, sedangkan aturan komposisi huruf besar dan angka justru
 * mendorong pola yang mudah ditebak.
 */
export const MINIMUM_PASSWORD_LENGTH = 12

export function checkPasswordPolicy(plain: string): PasswordPolicyResult {
  const problems: string[] = []

  if (plain.length < MINIMUM_PASSWORD_LENGTH) {
    problems.push(`Kata sandi minimal ${MINIMUM_PASSWORD_LENGTH} karakter.`)
  }
  if (plain.length > 200) {
    problems.push('Kata sandi terlalu panjang.')
  }

  return { ok: problems.length === 0, problems }
}
