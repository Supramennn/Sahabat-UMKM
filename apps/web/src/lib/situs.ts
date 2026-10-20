import type { Metadata } from 'next'

/**
 * Bagian situs publik yang dipakai bersama oleh semua halamannya: tautan
 * navigasi, tautan kaki, dan metadata per halaman (PRD 11).
 *
 * Aturan yang berlaku seperti beranda: tautan hanya menunjuk halaman yang
 * ada (PRD 5), dan tidak ada klaim tanpa bukti.
 */

export interface Tautan {
  label: string
  href: string
}

export const tagline = 'Catat rapi, belanja tepat.'

/** Navigasi atas, sesuai struktur situs PRD 5. */
export const tautanNavigasi: Tautan[] = [
  { label: 'Fitur', href: '/fitur' },
  { label: 'Untuk usaha F&B dan retail', href: '/untuk-usaha' },
  { label: 'Harga', href: '/harga' },
]

export const tautanMasuk: Tautan = { label: 'Masuk', href: '/masuk' }

export const tombolBuatAkun: Tautan = { label: 'Buat akun gratis', href: '/buat-akun' }

/** Kaki situs: tautan halaman dan tautan dokumen (PRD 11: Privasi, Syarat, Refund, Status, Kontak). */
export const tautanKakiHalaman: Tautan[] = [
  { label: 'Pusat Bantuan', href: '/bantuan' },
  { label: 'Tentang', href: '/tentang' },
  { label: 'Status Layanan', href: '/status' },
  { label: 'Kontak', href: '/kontak' },
  { label: 'Masuk', href: '/masuk' },
  { label: 'Buat akun gratis', href: '/buat-akun' },
]

export const tautanKakiKebijakan: Tautan[] = [
  { label: 'Kebijakan Privasi', href: '/kebijakan/privasi' },
  { label: 'Syarat dan Ketentuan', href: '/kebijakan/syarat' },
  { label: 'Kebijakan Refund', href: '/kebijakan/refund' },
]

/** Catatan di bawah kaki situs: dokumen hukum masih draf, dan halaman transparansi menyatakan keadaan apa adanya. */
export const catatanKaki =
  'Dokumen kebijakan di tautan kaki masih draf dan belum berlaku sampai peninjauan penasihat hukum selesai, dan halaman Status Layanan serta Kontak menuliskan keadaan layanan hari ini apa adanya.'

/** Metadata per halaman situs publik. metadataBase dibaca dari root layout. */
export function metadataSitus({
  jalur,
  judul,
  deskripsi,
}: {
  jalur: string
  judul: string
  deskripsi: string
}): Metadata {
  return {
    title: judul,
    description: deskripsi,
    alternates: { canonical: jalur },
    openGraph: {
      type: 'website',
      locale: 'id_ID',
      siteName: 'Sahabat UMKM',
      url: jalur,
      title: judul,
      description: deskripsi,
    },
  }
}
