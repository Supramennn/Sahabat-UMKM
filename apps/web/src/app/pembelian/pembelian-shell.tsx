'use client'

import { useApp } from '../components/app-context'
import { AppShell, type NavItem } from '../components/shell'

/**
 * Modul pembelian (PRD 5: Pembelian > Supplier, Purchase Order, Penerimaan, Retur,
 * Pembayaran).
 *
 * Modul memakai kerangka yang sama dengan modul stok, supaya navigasi dan bentuk
 * komponennya tidak berbeda antara modul.
 */

export const purchasingNav: NavItem[] = [
  { href: '/pembelian', label: 'Ringkasan', short: 'Beli' },
  { href: '/pembelian/po', label: 'Purchase Order', short: 'PO' },
  { href: '/pembelian/penerimaan', label: 'Penerimaan', short: 'Terima' },
  { href: '/pembelian/supplier', label: 'Supplier', short: 'Supplier' },
  { href: '/pembelian/retur', label: 'Retur pembelian', short: 'Retur' },
  { href: '/pembelian/pembayaran', label: 'Pembayaran', short: 'Bayar' },
  { href: '/stok', label: 'Kembali ke stok', short: 'Stok' },
]

export function PurchasingShell({
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
      breadcrumb={breadcrumb ?? 'Pembelian'}
      title={title}
      actions={actions}
    >
      {children}
    </AppShell>
  )
}
