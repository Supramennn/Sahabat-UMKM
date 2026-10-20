import type { MetadataRoute } from 'next'

const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Situs publik dibuka untuk semua mesin pencari. Halaman aplikasi setelah masuk
 * tidak diindeks: isinya milik pengguna, menuntut sesi, dan tidak berguna di
 * hasil pencarian.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/atur-ulang-kata-sandi',
          '/buat-usaha',
          '/dashboard',
          '/lainnya',
          '/laporan',
          '/notifikasi',
          '/pembelian',
          '/pengaturan',
          '/pengeluaran',
          '/penjualan',
          '/po',
          '/stok',
          '/undangan',
          '/verifikasi-email',
        ],
      },
    ],
    sitemap: `${SITUS}/sitemap.xml`,
  }
}
