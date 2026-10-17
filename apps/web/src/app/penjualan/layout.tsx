import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProvider } from '../components/app-context'

export const metadata: Metadata = {
  title: 'Penjualan',
  description: 'Catat penjualan, pelanggan, dan impor penjualan dari berkas.',
}

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <AppProvider title="Penjualan">{children}</AppProvider>
}