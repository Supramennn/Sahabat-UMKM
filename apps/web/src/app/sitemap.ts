import type { MetadataRoute } from 'next'

const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * Peta situs hanya memuat halaman publik yang sudah ada (PRD 5). Halaman fitur,
 * harga, pusat bantuan, status, dan dokumen kebijakan menyusul pada Fase 12.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITUS}/`, changeFrequency: 'monthly', priority: 1 }]
}
