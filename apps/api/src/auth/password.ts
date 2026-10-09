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
 * Bandingkan dua hash dengan waktu yang relatif tetap, supaya serangan waktu
 * tidak bisa memberitahu apakah pengguna itu terdaftar lewat perbedaan lama.
 */
/**
 * Mengembalikan indeks hash yang cocok, atau -1 bila tidak ada yang cocok.
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
