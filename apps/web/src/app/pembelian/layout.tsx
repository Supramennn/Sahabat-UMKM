import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProvider } from '../components/app-context'

export const metadata: Metadata = {
  title: 'Pembelian',
  description: 'Supplier, purchase order, penerimaan barang, dan pembayaran supplier.',
}

/**
 * Modul pembelian memakai penyedia konteks yang sama dengan modul stok, supaya
 * sesi, workspace, dan peran dimuat sekali untuk seluruh halaman di bawahnya.
 */
export default function PurchasingLayout({ children }: { children: ReactNode }) {
  return <AppProvider title="Pembelian">{children}</AppProvider>
}
