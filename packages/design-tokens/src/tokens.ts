/**
 * Token warna dari PRD 10. Setiap token membawa alasannya, karena PRD 10 dan
 * aturan R-31 meminta keputusan visual dapat dijelaskan dalam satu baris.
 *
 * Aksen kuning tidak pernah menjadi warna teks di atas putih. Ia hanya dipakai
 * sebagai isian sorotan dengan teks gelap, sesuai PRD 10.
 */

export const colors = {
  /** Navigasi dan judul. Rasio 14,10:1 di putih. */
  primary: '#172B4D',
  /** Tombol utama, tautan, aksi positif. Satu-satunya warna merek. Rasio 5,24:1 di putih. */
  secondary: '#0B7A6B',
  /** Isian sorotan saja, tidak pernah teks. 1,81:1 di putih, karena itu dilarang sebagai teks. */
  accent: '#F5B544',
  /** Teks di atas isian aksen. Rasio 8,94:1 di atas aksen. */
  textOnAccent: '#17212F',
  /** Latar aplikasi. */
  background: '#F7F9FC',
  /** Kartu dan panel. */
  surface: '#FFFFFF',
  /** Isi teks. Rasio 15,37:1 di background. */
  textPrimary: '#17212F',
  /** Keterangan dan placeholder. 7,18:1 di background, 7,58:1 di surface. */
  textSecondary: '#475569',
  /** Status sukses, selalu bersama teks atau ikon. 5,02:1 di surface. */
  success: '#15803D',
  /** Status peringatan, selalu bersama teks atau ikon. 5,02:1 di surface. */
  warning: '#B45309',
  /** Status bahaya, selalu bersama teks atau ikon. 6,47:1 di surface. */
  danger: '#B91C1C',
  /**
   * Batas input dan komponen. PRD 10 menyebut #8A94A6, tetapi nilai itu hanya
   * 2,90:1 di atas background, jadi gagal syarat 3:1 milik PRD sendiri.
   * Nilai ini 4,14:1 di background.
   */
  borderStrong: '#6E7A8A',
  /** Garis pemisah dekoratif. Bawaan, bukan pembawa informasi. */
  borderSubtle: '#8A94A6',
  /** Cincin fokus. 4,96:1 di background, jauh di atas 3:1. */
  focusRing: '#0B7A6B',
} as const

export type ColorToken = keyof typeof colors

export const radii = {
  /** Isian dan tombol. */
  control: '6px',
  /** Kartu dan panel. */
  surface: '10px',
  /** Lencana status. */
  badge: '999px',
} as const

/**
 * Skala spasi. PRD 10 meminta target sentuh minimal 44 x 44 px, jadi tinggi
 * kontrol minimum adalah 44px.
 */
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  section: '64px',
} as const

export const minTouchTarget = '44px'

export const typography = {
  /** PRD 10 mensyaratkan ukuran dasar teks isi minimal 16 px. */
  baseFontSize: '16px',
  fontFamily:
    "'Inter', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  /** Angka rupiah dan tanggal memakai angka tabular agar kolom lurus. */
  numericFontVariant: "'tnum' 1, 'lnum' 1",
} as const
