'use client'

import { useApp } from '../components/app-context'
import { AppShell, type NavItem } from '../components/shell'

/**
 * Modul penjualan (PRD 5: Penjualan > Daftar Penjualan, Pelanggan).
 *
 * Kerangka yang sama dengan modul stok dan pembelian, supaya navigasi dan bentuk
 * komponennya tidak berbeda antar modul.
 */

export const salesNav: NavItem[] = [
  { href: '/penjualan', label: 'Daftar penjualan', short: 'Jual' },
  { href: '/penjualan/baru', label: 'Catat penjualan', short: 'Catat' },
  { href: '/penjualan/pelanggan', label: 'Pelanggan', short: 'Pelanggan' },
  { href: '/penjualan/impor', label: 'Impor penjualan', short: 'Impor' },
  { href: '/stok', label: 'Kembali ke stok', short: 'Stok' },
]

export function SalesShell({
  activeHref,
  title,
  breadcrumb,
  actions,
  children,
}: {
  activeHref: string
  title: string
  breadcrumb?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const app = useApp()

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref={activeHref}
      breadcrumb={breadcrumb ?? 'Penjualan'}
      title={title}
      actions={actions}
    >
      {children}
    </AppShell>
  )
}