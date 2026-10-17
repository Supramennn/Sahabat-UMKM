import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { MotionProvider } from './components/motion'
import '../styles/globals.css'

export const metadata: Metadata = {
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
