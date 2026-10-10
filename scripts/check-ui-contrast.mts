/**
 * Kontras untuk pasangan warna yang dipakai komponen, bukan hanya token.
 *
 * PRD 10 mewajibkan setiap pasangan warna baru dihitung sebelum dipakai. Token
 * asli dijaga oleh tes di packages/design-tokens, tapi komponen ini memakai
 * beberapa warna turunan untuk keadaan hover, latar alert, dan lencana, dan
 * warna-warna itu tidak terlihat di mana pun kecuali di sini.
 *
 * Jalankan: npx tsx scripts/check-ui-contrast.mts
 */

import { contrastRatio, formatRatio } from '../packages/design-tokens/src/contrast.ts'

const NORMAL_TEXT = 4.5
const NON_TEXT = 3

interface Pairing {
  name: string
  foreground: string
  background: string
  minimum: number
}

const pairings: Pairing[] = [
  { name: 'tombol utama, teks di tombol', foreground: '#ffffff', background: '#0b7a6b', minimum: NORMAL_TEXT },
  { name: 'tombol utama, keadaan hover', foreground: '#ffffff', background: '#096053', minimum: NORMAL_TEXT },
  { name: 'tombol sekunder, teks di tombol', foreground: '#172b4d', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'tombol bahaya, teks di tombol', foreground: '#b91c1c', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'tombol bahaya, keadaan hover', foreground: '#b91c1c', background: '#fef2f2', minimum: NORMAL_TEXT },
  { name: 'galat, teks di latar galat', foreground: '#7f1d1d', background: '#fef2f2', minimum: NORMAL_TEXT },
  { name: 'galat, batas di latar galat', foreground: '#b91c1c', background: '#fef2f2', minimum: NON_TEXT },
  { name: 'sukses, teks di latar sukses', foreground: '#14532d', background: '#f0fdf4', minimum: NORMAL_TEXT },
  { name: 'sukses, batas di latar sukses', foreground: '#15803d', background: '#f0fdf4', minimum: NON_TEXT },
  { name: 'lencana perangkat, teks', foreground: '#14532d', background: '#ecfdf5', minimum: NORMAL_TEXT },
  { name: 'lencana perangkat, batas', foreground: '#15803d', background: '#ecfdf5', minimum: NON_TEXT },
  { name: 'keadaan data, batas di latar aplikasi', foreground: '#6e7a8a', background: '#f7f9fc', minimum: NON_TEXT },
  { name: 'keadaan data, batas di kartu', foreground: '#6e7a8a', background: '#ffffff', minimum: NON_TEXT },
  { name: 'batas isian di atas kartu', foreground: '#6e7a8a', background: '#ffffff', minimum: NON_TEXT },
  { name: 'batas isian di atas latar aplikasi', foreground: '#6e7a8a', background: '#f7f9fc', minimum: NON_TEXT },
  { name: 'kode pemulihan, batas di atas kartu', foreground: '#6e7a8a', background: '#ffffff', minimum: NON_TEXT },
  { name: 'cincin fokus di atas latar aplikasi', foreground: '#0b7a6b', background: '#f7f9fc', minimum: NON_TEXT },
  { name: 'teks utama di atas latar aplikasi', foreground: '#17212f', background: '#f7f9fc', minimum: NORMAL_TEXT },
  { name: 'teks sekunder di atas kartu', foreground: '#475569', background: '#ffffff', minimum: NORMAL_TEXT },

  // Modul stok. Semua warna di sini sudah ada di token PRD 10; yang diperiksa
  // adalah pasangan yang benar-benar dipakai, termasuk bilah atas yang gelap.
  { name: 'bilah atas, nama aplikasi', foreground: '#ffffff', background: '#172b4d', minimum: NORMAL_TEXT },
  { name: 'bilah atas, nama workspace', foreground: '#dbe3f0', background: '#172b4d', minimum: NORMAL_TEXT },
  { name: 'lencana stok normal, teks', foreground: '#15803d', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'lencana stok normal, batas', foreground: '#15803d', background: '#ffffff', minimum: NON_TEXT },
  { name: 'lencana stok rendah, teks', foreground: '#b45309', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'lencana stok rendah, batas', foreground: '#b45309', background: '#ffffff', minimum: NON_TEXT },
  { name: 'lencana habis, teks', foreground: '#b91c1c', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'lencana habis, batas', foreground: '#b91c1c', background: '#ffffff', minimum: NON_TEXT },
  { name: 'kartu saldo, batas', foreground: '#8a94a6', background: '#ffffff', minimum: NON_TEXT },
  { name: 'tombol simpan, teks', foreground: '#ffffff', background: '#0b7a6b', minimum: NORMAL_TEXT },
  { name: 'tombol simpan, keadaan mati', foreground: '#ffffff', background: '#69748a', minimum: NORMAL_TEXT },
  { name: 'tombol pilihan aktif, teks', foreground: '#ffffff', background: '#172b4d', minimum: NORMAL_TEXT },
  { name: 'bilah bawah ponsel, teks', foreground: '#475569', background: '#ffffff', minimum: NORMAL_TEXT },
  { name: 'bilah bawah ponsel, teks aktif', foreground: '#0b7a6b', background: '#ffffff', minimum: NORMAL_TEXT },
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
