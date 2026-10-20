import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { PwaRegistrasi } from './components/pwa-registrasi'
import { MotionProvider } from './components/motion'
import '../styles/globals.css'

/** Alamat situs dipasang sekali di sini supaya kanonik dan OG tidak berbeda-beda. */
const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITUS),
  title: 'Sahabat UMKM',
  description: 'Catat stok, kelola pembelian, catat penjualan, dan baca laporan usaha.',
  // PRD 10: aplikasi dapat dipasang sebagai PWA.
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Sahabat UMKM',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/ikon/ikon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/ikon/ikon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/ikon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

// Warna antarmuka peramban memakai token Primary PRD 10.
export const viewport: Viewport = {
  themeColor: '#172B4D',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <MotionProvider>{children}</MotionProvider>
        <PwaRegistrasi />
      </body>
    </html>
  )
}
