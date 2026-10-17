import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProvider } from '../components/app-context'

export const metadata: Metadata = {
  title: 'Pengeluaran',
  description: 'Catat dan telusuri biaya operasional usaha Anda.',
}

export default function ExpensesLayout({ children }: { children: ReactNode }) {
  return <AppProvider title="Pengeluaran">{children}</AppProvider>
}
