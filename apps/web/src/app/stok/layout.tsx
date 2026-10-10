import type { Metadata } from 'next'
import { AppProvider } from '../components/app-context'

export const metadata: Metadata = {
  title: 'Stok',
  description: 'Daftar barang, saldo per lokasi, dan input stok.',
}

/**
 * Modul stok memakai satu penyedia konteks untuk sesi, workspace, dan peran.
 * Halaman-halamannya memuat datanya sendiri supaya keadaan memuat tiap layar
 * tetap terlihat, bukan bergantung pada kerangka (PRD 10).
 */
export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}
