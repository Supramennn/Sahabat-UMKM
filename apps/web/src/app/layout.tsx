import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { MotionProvider } from './components/motion'
import '../styles/globals.css'

/** Alamat situs dipasang sekali di sini supaya kanonik dan OG tidak berbeda-beda. */
const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITUS),
  title: 'Sahabat UMKM',
  description: 'Catat stok, kelola pembelian, catat penjualan, dan baca laporan usaha.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
