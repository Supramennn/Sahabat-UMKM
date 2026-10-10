import type { ReactNode } from 'react'
import styles from './shell.module.css'

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
  { href: '/stok', label: 'Stok', short: 'Stok' },
  { href: '/stok/input', label: 'Catat stok', short: 'Catat' },
  { href: '/stok/peringatan', label: 'Perlu perhatian', short: 'Perhatian' },
  { href: '/stok/impor', label: 'Impor barang', short: 'Impor' },
  { href: '/pembelian', label: 'Pembelian', short: 'Beli' },
  { href: '/pembelian/po', label: 'Purchase order', short: 'PO' },
  { href: '/pembelian/penerimaan', label: 'Penerimaan', short: 'Terima' },
  { href: '/pembelian/supplier', label: 'Supplier', short: 'Supplier' },
  { href: '/pembelian/pembayaran', label: 'Pembayaran', short: 'Bayar' },
  { href: '/stok/riwayat', label: 'Riwayat stok', short: 'Riwayat' },
  { href: '/stok/opname', label: 'Stok opname', short: 'Opname' },
  { href: '/stok/lokasi', label: 'Lokasi', short: 'Lokasi' },
  { href: '/pengaturan/akun', label: 'Pengaturan akun', short: 'Akun' },
]

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
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#konten-utama">
        Lewati ke isi utama
      </a>

      <header className={styles.topBar}>
        <div className={styles.brandBlock}>
          <span className={styles.brand}>Sahabat UMKM</span>
          <span className={styles.workspace}>{workspaceName}</span>
        </div>
        <p className={styles.role}>{roleLabel}</p>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Menu modul">
          <ul className={styles.navList}>
            {moduleNav.map((item) => (
              <li key={item.href}>
                <a
                  className={item.href === activeHref ? styles.navLinkActive : styles.navLink}
                  href={item.href}
                  aria-current={item.href === activeHref ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className={styles.main} id="konten-utama">
          <nav aria-label="Remah roti">
            <ol className={styles.breadcrumb}>
              <li>{breadcrumb}</li>
              <li aria-current="page">{title}</li>
            </ol>
          </nav>

          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>

          {children}
        </main>
      </div>

      <nav className={styles.bottomNav} aria-label="Menu utama ponsel">
        {moduleNav.slice(0, 4).map((item) => (
          <a
            key={item.href}
            className={item.href === activeHref ? styles.bottomLinkActive : styles.bottomLink}
            href={item.href}
            aria-current={item.href === activeHref ? 'page' : undefined}
          >
            {item.short}
          </a>
        ))}
      </nav>
    </div>
  )
}
