'use client'

import { useState } from 'react'
import Link from 'next/link'
import { grantFor } from '@sahabat/shared'
import { API_BASE } from '../../../lib/api'
import { Alert, Button, ErrorState } from '../../components/ui'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import styles from './page.module.css'

/**
 * Pengaturan Impor dan Ekspor (PRD 6.8).
 *
 * Ekspor penuh menghasilkan satu arsip berisi CSV tiap tabel bisnis dan tersedia
 * untuk semua paket. Impor yang sudah punya alur sendiri (produk dan penjualan)
 * ditautkan dari sini, bukan disalin, supaya template dan riwayat impor tetap
 * satu tempat sampai Fase 9 memusatkannya di halaman ini.
 */
export default function DataPage() {
  return (
    <AppProvider title="Impor dan ekspor">
      <DataPageContent />
    </AppProvider>
  )
}

function DataPageContent() {
  const app = useApp()
  const boleh = grantFor(app.role, 'data.export') === 'manage'
  const [mengunduh, setMengunduh] = useState(false)
  const [selesai, setSelesai] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  async function unduh() {
    setMengunduh(true)
    setSelesai(false)
    setGalat(null)
    try {
      const response = await fetch(`${API_BASE}/api/workspaces/${app.workspaceId}/exports/workspace`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        setGalat(body.message ?? 'Arsip data tidak dapat dibuat.')
        return
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'sahabat-umkm-data.zip'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setSelesai(true)
    } catch {
      setGalat('Tidak bisa menghubungi server untuk membuat arsip.')
    } finally {
      setMengunduh(false)
    }
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/impor-ekspor"
      breadcrumb="Pengaturan"
      title="Impor dan ekspor"
    >
      <div className={styles.page}>
        <section className={styles.card} aria-labelledby="ekspor-data">
          <h2 id="ekspor-data">Ekspor seluruh data usaha</h2>
          <p>
            Arsip berisi seluruh data workspace dalam berkas CSV, satu berkas untuk satu
            tabel: produk, stok, pembelian, penjualan, pengeluaran, dan seterusnya.
            Tersedia untuk semua paket dan tidak dikenai biaya tambahan.
          </p>
          <ul className={styles.list}>
            <li>Berkas CSV bisa dibuka di aplikasi spreadsheet mana pun.</li>
            <li>Kolom id dipertahankan supaya hubungan antar tabel bisa ditelusuri.</li>
            <li>Ada PANDUAN.txt di dalam arsip yang menjelaskan isinya.</li>
            <li>Foto dan PDF lampiran pengeluaran tidak ikut karena berbentuk berkas gambar.</li>
          </ul>

          {boleh ? (
            <div className={styles.actions}>
              <Button type="button" onClick={() => void unduh()} disabled={mengunduh}>
                {mengunduh ? 'Menyiapkan arsip...' : 'Unduh arsip data'}
              </Button>
            </div>
          ) : (
            <Alert kind="info">
              Hanya Owner dan Admin yang dapat mengunduh seluruh data workspace. Anda tetap
              bisa mengekspor laporan sesuai izin Anda dari halaman Laporan.
            </Alert>
          )}

          {galat ? <ErrorState title="Ekspor data tidak berhasil" body={galat} action={<Button type="button" variant="secondary" onClick={() => void unduh()}>Coba lagi</Button>} /> : null}
          {selesai ? <Alert kind="success">Arsip data sudah diunduh. Simpan berkas itu di tempat yang aman karena isinya data usaha Anda.</Alert> : null}
        </section>

        <section className={styles.card} aria-labelledby="impor-data">
          <h2 id="impor-data">Impor data</h2>
          <p>
            Impor berjalan dua langkah: periksa dulu pratinjaunya, lalu simpan. Template
            yang bisa diunduh tersedia di halaman masing-masing.
          </p>
          <ul className={styles.list}>
            <li><Link href="/stok/impor">Impor barang</Link> dari CSV untuk menambah produk beserta kategori dan saldo awalnya.</li>
            <li><Link href="/penjualan/impor">Impor penjualan</Link> dari CSV untuk memindahkan riwayat penjualan lama.</li>
          </ul>
        </section>
      </div>
    </AppShell>
  )
}
