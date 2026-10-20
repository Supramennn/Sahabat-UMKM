import type { MetadataRoute } from 'next'

/**
 * Peta situs memuat halaman publik yang sudah ada (PRD 5). Halaman aplikasi
 * yang butuh sesi tidak ikut, dan halaman yang belum siap tidak dipasang.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const halaman = [
    '/',
    '/fitur',
    '/fitur/stok',
    '/fitur/pembelian',
    '/fitur/penjualan',
    '/fitur/pengeluaran',
    '/fitur/laporan',
    '/fitur/langganan',
    '/untuk-usaha',
    '/harga',
    '/bantuan',
    '/tentang',
    '/status',
    '/kontak',
    '/kebijakan/privasi',
    '/kebijakan/syarat',
    '/kebijakan/refund',
  ]

  return halaman.map((url) => ({ url: `${SITUS}${url}`, changeFrequency: 'monthly', priority: 1 }))
}
