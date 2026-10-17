/**
 * Kontras untuk pasangan warna yang dipakai komponen, bukan hanya token.
 *
 * PRD 10 mewajibkan setiap pasangan warna baru dihitung sebelum dipakai. Nilai
 * warna diambil dari packages/design-tokens/src/tokens.ts, jadi daftar ini tidak
 * bisa menyimpang dari token; yang berbeda di sini hanya pemasangan yang
 * benar-benar dipakai antarmuka.
 *
 * Jalankan: npm run test:contrast
 */

import { contrastRatio, formatRatio } from '../packages/design-tokens/src/contrast.ts'
import { colors } from '../packages/design-tokens/src/tokens.ts'

const NORMAL_TEXT = 4.5
const NON_TEXT = 3

interface Pairing {
  name: string
  foreground: string
  background: string
  minimum: number
}

const pairings: Pairing[] = [
  { name: 'tombol utama, teks di tombol', foreground: colors.surface, background: colors.secondary, minimum: NORMAL_TEXT },
  { name: 'tombol utama, keadaan hover', foreground: colors.surface, background: colors.secondaryDeep, minimum: NORMAL_TEXT },
  { name: 'tombol sekunder, teks di tombol', foreground: colors.primary, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'tombol sekunder, batas saat diarahkan', foreground: colors.textSecondary, background: colors.surface, minimum: NON_TEXT },
  { name: 'tombol bahaya, teks di tombol', foreground: colors.danger, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'tombol bahaya, keadaan hover', foreground: colors.danger, background: colors.dangerSurface, minimum: NORMAL_TEXT },
  { name: 'galat, teks di latar galat', foreground: colors.dangerInk, background: colors.dangerSurface, minimum: NORMAL_TEXT },
  { name: 'galat, batas di latar galat', foreground: colors.danger, background: colors.dangerSurface, minimum: NON_TEXT },
  { name: 'sukses, teks di latar sukses', foreground: colors.successInk, background: colors.successSurface, minimum: NORMAL_TEXT },
  { name: 'sukses, batas di latar sukses', foreground: colors.success, background: colors.successSurface, minimum: NON_TEXT },
  { name: 'lencana status sesi, teks', foreground: colors.successInk, background: colors.successMuted, minimum: NORMAL_TEXT },
  { name: 'lencana status sesi, batas', foreground: colors.success, background: colors.successMuted, minimum: NON_TEXT },
  { name: 'keadaan data, batas di latar aplikasi', foreground: colors.borderStrong, background: colors.background, minimum: NON_TEXT },
  { name: 'keadaan data, batas di kartu', foreground: colors.borderStrong, background: colors.surface, minimum: NON_TEXT },
  { name: 'batas isian di atas kartu', foreground: colors.borderStrong, background: colors.surface, minimum: NON_TEXT },
  { name: 'batas isian di atas latar aplikasi', foreground: colors.borderStrong, background: colors.background, minimum: NON_TEXT },
  { name: 'kode pemulihan, batas di atas kartu', foreground: colors.borderStrong, background: colors.surface, minimum: NON_TEXT },
  { name: 'cincin fokus di atas latar aplikasi', foreground: colors.focusRing, background: colors.background, minimum: NON_TEXT },
  { name: 'cincin fokus di atas kartu', foreground: colors.focusRing, background: colors.surface, minimum: NON_TEXT },
  { name: 'teks utama di atas latar aplikasi', foreground: colors.textPrimary, background: colors.background, minimum: NORMAL_TEXT },
  { name: 'teks sekunder di atas kartu', foreground: colors.textSecondary, background: colors.surface, minimum: NORMAL_TEXT },

  // Kerangka aplikasi: bilah atas gelap dan navigasi.
  { name: 'bilah atas, nama aplikasi', foreground: colors.surface, background: colors.primary, minimum: NORMAL_TEXT },
  { name: 'bilah atas, nama workspace', foreground: colors.onPrimaryMuted, background: colors.primary, minimum: NORMAL_TEXT },
  { name: 'bilah bawah ponsel, teks', foreground: colors.textSecondary, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'bilah bawah ponsel, teks aktif', foreground: colors.secondary, background: colors.surface, minimum: NORMAL_TEXT },

  // Lencana dan tombol modul stok; semuanya memakai token yang sama.
  { name: 'lencana stok normal, teks', foreground: colors.success, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'lencana stok normal, batas', foreground: colors.success, background: colors.surface, minimum: NON_TEXT },
  { name: 'lencana stok rendah, teks', foreground: colors.warning, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'lencana stok rendah, batas', foreground: colors.warning, background: colors.surface, minimum: NON_TEXT },
  { name: 'lencana habis, teks', foreground: colors.danger, background: colors.surface, minimum: NORMAL_TEXT },
  { name: 'lencana habis, batas', foreground: colors.danger, background: colors.surface, minimum: NON_TEXT },
  { name: 'kartu saldo, batas', foreground: colors.borderSubtle, background: colors.surface, minimum: NON_TEXT },
  { name: 'tombol simpan, teks', foreground: colors.surface, background: colors.secondary, minimum: NORMAL_TEXT },
  { name: 'tombol simpan, keadaan mati', foreground: colors.surface, background: colors.disabledBackground, minimum: NORMAL_TEXT },
  { name: 'tombol pilihan aktif, teks', foreground: colors.surface, background: colors.primary, minimum: NORMAL_TEXT },
]

let gagal = 0

for (const { name, foreground, background, minimum } of pairings) {
  const ratio = contrastRatio(foreground, background)
  const ok = ratio >= minimum
  if (!ok) {
    gagal += 1
  }
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(38)} ${formatRatio(ratio).padStart(9)} (min ${minimum})`,
  )
}

console.log(gagal === 0 ? `\nSemua ${pairings.length} pasangan lolos.` : `\n${gagal} pasangan gagal.`)

if (gagal > 0) {
  process.exitCode = 1
}
