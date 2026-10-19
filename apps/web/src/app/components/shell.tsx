'use client'

import type { ChangeEvent, ReactNode } from 'react'
import { useState } from 'react'
import { apiPost, errorMessage } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useApp } from './app-context'
import { PageTransition } from './motion'

/**
 * Kerangka aplikasi setelah masuk. PRD 10: desktop memakai sidebar, bilah atas,
 * breadcrumb, judul halaman, dan aksi utama di kanan atas. Ponsel memakai navigasi
 * bawah untuk Dashboard, Stok, Pembelian, Penjualan, dan Lainnya, dengan target
 * sentuh minimal 44 px.
 *
 * Menu yang halamannya belum jadi sengaja tidak dipasang di sini. PRD 11 melarang
 * tautan navigasi menuju halaman yang belum ada saat rilis.
 */

export interface NavItem {
  href: string
  label: string
  short: string
}

export const moduleNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', short: 'Dasbor' },
  { href: '/stok', label: 'Stok', short: 'Stok' },
  { href: '/stok/input', label: 'Catat stok', short: 'Catat' },
  { href: '/stok/peringatan', label: 'Perlu perhatian', short: 'Perhatian' },
  { href: '/stok/impor', label: 'Impor barang', short: 'Impor' },
  { href: '/stok/impor-saldo-awal', label: 'Impor saldo awal', short: 'Saldo' },
  { href: '/pembelian', label: 'Pembelian', short: 'Beli' },
  { href: '/pembelian/po', label: 'Purchase order', short: 'PO' },
  { href: '/pembelian/penerimaan', label: 'Penerimaan', short: 'Terima' },
  { href: '/pembelian/supplier', label: 'Supplier', short: 'Supplier' },
  { href: '/pembelian/impor-supplier', label: 'Impor supplier', short: 'Impor' },
  { href: '/pembelian/retur', label: 'Retur pembelian', short: 'Retur' },
  { href: '/pembelian/pembayaran', label: 'Pembayaran', short: 'Bayar' },
  { href: '/penjualan', label: 'Penjualan', short: 'Jual' },
  { href: '/pengeluaran', label: 'Pengeluaran', short: 'Biaya' },
  { href: '/laporan', label: 'Laporan', short: 'Lapor' },
  { href: '/pengaturan/paket', label: 'Paket dan langganan', short: 'Paket' },
  { href: '/pengaturan/impor-ekspor', label: 'Impor dan ekspor', short: 'Data' },
  { href: '/pengaturan/usaha', label: 'Profil usaha', short: 'Usaha' },
  { href: '/pengaturan/anggota', label: 'Anggota dan peran', short: 'Anggota' },
  { href: '/penjualan/baru', label: 'Catat penjualan', short: 'Jual' },
  { href: '/penjualan/pelanggan', label: 'Pelanggan', short: 'Pelanggan' },
  { href: '/penjualan/impor', label: 'Impor penjualan', short: 'Impor' },
  { href: '/stok/riwayat', label: 'Riwayat stok', short: 'Riwayat' },
  { href: '/stok/opname', label: 'Stok opname', short: 'Opname' },
  { href: '/stok/lokasi', label: 'Lokasi', short: 'Lokasi' },
  { href: '/pengaturan/akun', label: 'Pengaturan akun', short: 'Akun' },
]

/**
 * Navigasi bawah ponsel sesuai PRD 10. Empat tujuan utama tampil langsung,
 * sisanya (termasuk Laporan dan Pengeluaran) dikumpulkan di halaman Lainnya.
 */
export const bottomNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', short: 'Dasbor' },
  { href: '/stok', label: 'Stok', short: 'Stok' },
  { href: '/pembelian', label: 'Pembelian', short: 'Beli' },
  { href: '/penjualan', label: 'Penjualan', short: 'Jual' },
  { href: '/lainnya', label: 'Menu lainnya', short: 'Lainnya' },
]

/**
 * PRD 6.1: satu akun bisa menjadi anggota beberapa workspace dan berpindah lewat
 * pemilih workspace. Pemilih hanya muncul saat jumlahnya lebih dari satu.
 */
function WorkspaceSwitcher({ fallbackName }: { fallbackName: string }) {
  const app = useApp()
  const [busy, setBusy] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  if (app.workspaces.length < 2) {
    return <span className="truncate text-sm text-on-primary-muted">{fallbackName}</span>
  }

  async function pilih(event: ChangeEvent<HTMLSelectElement>) {
    const workspaceId = Number(event.target.value)
    if (!Number.isFinite(workspaceId) || workspaceId === app.workspaceId) return

    setBusy(true)
    setSwitchError(null)
    const result = await apiPost('/api/auth/switch-workspace', { workspaceId })
    if (!result.ok) {
      setBusy(false)
      setSwitchError(errorMessage(result.error, 'Usaha tidak bisa diganti.'))
      return
    }
    window.location.reload()
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="visually-hidden" htmlFor="pemilih-usaha">
        Pilih usaha
      </label>
      <select
        className="min-h-touch w-full cursor-pointer truncate rounded-control border border-on-primary-muted bg-primary px-2 text-base text-white disabled:cursor-wait"
        id="pemilih-usaha"
        value={app.workspaceId}
        onChange={pilih}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {app.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {switchError ? (
        <p className="text-sm text-white" role="alert">
          Gagal: {switchError}
        </p>
      ) : null}
    </div>
  )
}

export function AppShell({
  workspaceName,
  roleLabel,
  activeHref,
  title,
  breadcrumb,
  actions,
  children,
}: {
  workspaceName: string
  roleLabel: string
  activeHref: string
  title: string
  breadcrumb: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a className="absolute -left-[9999px] top-2 z-10 rounded-control bg-surface px-3 py-2 focus:left-2" href="#konten-utama">
        Lewati ke isi utama
      </a>

      <header className="flex items-center justify-between gap-3 bg-primary px-4 py-3 text-white">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold tracking-[0.01em]">Sahabat UMKM</span>
          <WorkspaceSwitcher fallbackName={workspaceName} />
        </div>
        <p className="shrink-0 text-sm text-on-primary-muted">{roleLabel}</p>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 pb-24 desktop:flex-row desktop:gap-8 desktop:px-8 desktop:py-6 desktop:pb-8">
        <nav
          className="hidden desktop:block desktop:shrink-0 desktop:basis-[220px]"
          aria-label="Menu modul"
        >
          <ul className="flex flex-col gap-1">
            {moduleNav.map((item) => {
              const active = item.href === activeHref
              return (
                <li key={item.href}>
                  <a
                    className={cx(
                      'flex min-h-touch items-center rounded-control border-l-[3px] px-3 text-text-primary transition-colors duration-150',
                      active
                        ? 'border-secondary bg-surface font-semibold'
                        : 'border-transparent hover:bg-surface',
                    )}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-4" id="konten-utama">
          <nav aria-label="Remah roti">
            <ol className="flex flex-wrap gap-2 text-sm text-text-secondary">
              <li>{breadcrumb}</li>
              <li className="before:mr-2 before:text-border-strong before:content-['/']" aria-current="page">
                {title}
              </li>
            </ol>
          </nav>

          <div className="flex flex-col-reverse gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>

          <PageTransition className="flex flex-col gap-4">{children}</PageTransition>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 flex border-t border-border-strong bg-surface desktop:hidden"
        aria-label="Menu utama ponsel"
      >
        {bottomNav.map((item) => {
          const active = item.href === activeHref
          return (
            <a
              key={item.href}
              className={cx(
                'relative flex min-h-touch flex-1 items-center justify-center py-2 text-center text-sm',
                active ? 'font-bold text-secondary' : 'text-text-secondary',
              )}
              href={item.href}
              aria-current={active ? 'page' : undefined}
            >
              {item.short}
              {active ? (
                <span aria-hidden="true" className="absolute bottom-0 h-1 w-10 rounded-full bg-secondary" />
              ) : null}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
