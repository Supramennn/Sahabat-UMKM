import { describe, expect, it } from 'vitest'
import { colors } from '../src/tokens.ts'
import { contrastRatio, formatRatio, hexToRgb, relativeLuminance } from '../src/contrast.ts'

/**
 * PRD 10: setiap pasangan warna baru wajib dihitung rasio kontrasnya sebelum
 * dipakai. Tes ini membuat aturan itu berjalan di setiap build, bukan hanya
 * saat seseorang ingat memeriksanya.
 */

const NORMAL_TEXT = 4.5
const LARGE_TEXT = 3
const NON_TEXT = 3

interface Pairing {
  description: string
  foreground: string
  background: string
  minimum: number
  prd: string
}

const pairings: Pairing[] = [
  { description: 'Judul dan navigasi di surface', foreground: colors.primary, background: colors.surface, minimum: NORMAL_TEXT, prd: '14,10:1 di putih' },
  { description: 'Teks utama di background aplikasi', foreground: colors.textPrimary, background: colors.background, minimum: NORMAL_TEXT, prd: '15,37:1 di background' },
  { description: 'Teks utama di surface kartu', foreground: colors.textPrimary, background: colors.surface, minimum: NORMAL_TEXT, prd: '15,37:1 di background' },
  { description: 'Teks sekunder di background aplikasi', foreground: colors.textSecondary, background: colors.background, minimum: NORMAL_TEXT, prd: '7,18:1 di background' },
  { description: 'Teks sekunder di surface kartu', foreground: colors.textSecondary, background: colors.surface, minimum: NORMAL_TEXT, prd: 'placeholder memakai warna ini' },
  { description: 'Teks tombol utama di secondary', foreground: colors.surface, background: colors.secondary, minimum: NORMAL_TEXT, prd: '5,24:1 dengan teks putih' },
  { description: 'Teks di atas isian aksen', foreground: colors.textOnAccent, background: colors.accent, minimum: NORMAL_TEXT, prd: '8,94:1' },
  { description: 'Status sukses di surface', foreground: colors.success, background: colors.surface, minimum: NORMAL_TEXT, prd: '5,02:1 di putih' },
  { description: 'Status peringatan di surface', foreground: colors.warning, background: colors.surface, minimum: NORMAL_TEXT, prd: '5,02:1 di putih' },
  { description: 'Status bahaya di surface', foreground: colors.danger, background: colors.surface, minimum: NORMAL_TEXT, prd: '6,47:1 di putih' },
  { description: 'Status sukses di background aplikasi', foreground: colors.success, background: colors.background, minimum: NORMAL_TEXT, prd: 'harus tetap lolos' },
  { description: 'Status peringatan di background aplikasi', foreground: colors.warning, background: colors.background, minimum: NORMAL_TEXT, prd: 'harus tetap lolos' },
  { description: 'Status bahaya di background aplikasi', foreground: colors.danger, background: colors.background, minimum: NORMAL_TEXT, prd: 'harus tetap lolos' },
  { description: 'Batas input di atas background aplikasi', foreground: colors.borderStrong, background: colors.background, minimum: NON_TEXT, prd: '4,14:1, menggantikan #8A94A6 yang hanya 2,90:1' },
  { description: 'Batas input di atas surface kartu', foreground: colors.borderStrong, background: colors.surface, minimum: NON_TEXT, prd: 'harus tetap lolos' },
  { description: 'Cincin fokus di atas background aplikasi', foreground: colors.focusRing, background: colors.background, minimum: NON_TEXT, prd: '4,96:1' },
  { description: 'Cincin fokus di atas surface kartu', foreground: colors.focusRing, background: colors.surface, minimum: NON_TEXT, prd: 'harus tetap lolos' },
]

describe('pasangan warna PRD 10', () => {
  it.each(pairings)('$description', ({ foreground, background, minimum }) => {
    const ratio = contrastRatio(foreground, background)
    expect(
      ratio,
      `${foreground} di ${background} bernilai ${formatRatio(ratio)}, di bawah ${minimum}:1`,
    ).toBeGreaterThanOrEqual(minimum)
  })

  it('mempertahankan rasio yang PRD 10 nyatakan', () => {
    expect(contrastRatio(colors.primary, colors.surface)).toBeCloseTo(14.1, 1)
    expect(contrastRatio(colors.secondary, colors.surface)).toBeCloseTo(5.24, 2)
    expect(contrastRatio(colors.textOnAccent, colors.accent)).toBeCloseTo(8.94, 2)
    expect(contrastRatio(colors.textSecondary, colors.background)).toBeCloseTo(7.18, 2)
    expect(contrastRatio(colors.success, colors.surface)).toBeCloseTo(5.02, 2)
    expect(contrastRatio(colors.warning, colors.surface)).toBeCloseTo(5.02, 2)
    expect(contrastRatio(colors.danger, colors.surface)).toBeCloseTo(6.47, 2)
  })
})

describe('larangan warna aksen sebagai teks', () => {
  it('gagal sebagai teks di atas putih, jadi tidak boleh dipakai demikian', () => {
    expect(contrastRatio(colors.accent, colors.surface)).toBeLessThan(LARGE_TEXT)
  })

  it('gagal sebagai teks di atas background aplikasi', () => {
    expect(contrastRatio(colors.accent, colors.background)).toBeLessThan(LARGE_TEXT)
  })

  it('lolos sebagai isian dengan teks gelap', () => {
    expect(contrastRatio(colors.textOnAccent, colors.accent)).toBeGreaterThanOrEqual(NORMAL_TEXT)
  })
})

describe('nilai yang PRD 10 tolak', () => {
  it('menunjukkan kenapa #8A94A6 tidak boleh jadi batas input', () => {
    // Angka ini dokumen alasan penggantian token, bukan sekadar catatan.
    expect(contrastRatio('#8A94A6', colors.surface)).toBeGreaterThanOrEqual(NON_TEXT)
    expect(contrastRatio('#8A94A6', colors.background)).toBeLessThan(NON_TEXT)
  })
})

describe('perhitungan kontras', () => {
  it('mengembalikan 21:1 untuk hitam di putih', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('simetris terhadap urutan warna', () => {
    expect(contrastRatio(colors.primary, colors.surface)).toBeCloseTo(
      contrastRatio(colors.surface, colors.primary),
      10,
    )
  })

  it('menolak warna yang tidak valid', () => {
    expect(() => hexToRgb('#FFF')).toThrow(/enam digit/)
    expect(() => hexToRgb('bukan warna')).toThrow(/tidak valid/)
  })

  it('menghitung luminans relatif putih dan hitam', () => {
    expect(relativeLuminance(hexToRgb('#FFFFFF'))).toBeCloseTo(1, 5)
    expect(relativeLuminance(hexToRgb('#000000'))).toBeCloseTo(0, 5)
  })
})
