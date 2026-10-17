'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp, AppProvider } from '../components/app-context'
import { AppShell } from '../components/shell'
import { ErrorState } from '../components/ui'
import { apiGet, errorMessage, type LocationsResponse } from '../../lib/api'
import styles from './page.module.css'

/**
 * Dashboard (PRD 6.7).
 *
 * Kartu, tren, distribusi status stok, dan daftar tindakan dibaca dari satu
 * endpoint supaya semua bagian memakai periode yang sama. Grafik hanyalah
 * tampilan tambahan: setiap grafik punya ringkasan teks dan tabel data yang
 * bisa dibuka, dan bilahnya ditandai dekoratif agar pembaca layar tidak
 * membacanya dua kali. Workspace kosong tidak menampilkan angka contoh, hanya
 * penjelasan dan tombol langkah berikutnya.
 */

type DashboardCard = {
  key: string
  label: string
  value: number
  format: 'jumlah' | 'rupiah'
  definition: string
  href: string
}

type TrendPoint = { label: string; value: number }

type DashboardTrend = {
  key: string
  title: string
  summary: string
  format: 'rupiah' | 'satuan'
  points: TrendPoint[]
}

type DashboardAction = {
  key: string
  title: string
  href: string
  empty: string
  items: Array<{ label: string; detail: string; href: string }>
}

type Dashboard = {
  from: string
  to: string
  locationId: number | null
  access: { stock: boolean; sales: boolean; purchasing: boolean; debts: boolean }
  cards: DashboardCard[]
  trends: DashboardTrend[]
  stockStatus: { summary: string; rows: Array<{ status: string; label: string; count: number }> } | null
  actions: DashboardAction[]
}

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

function formatNilai(value: number, format: 'jumlah' | 'rupiah' | 'satuan'): string {
  return format === 'rupiah' ? rupiah.format(value) : angka.format(value)
}

export default function DashboardPage() {
  return (
    <AppProvider title="Dashboard">
      <DashboardPageContent />
    </AppProvider>
  )
}

function DashboardPageContent() {
  const app = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const params = useMemo(() => {
    const value = new URLSearchParams()
    if (from) value.set('from', from)
    if (to) value.set('to', to)
    if (locationId) value.set('locationId', locationId)
    return value
  }, [from, locationId, to])

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) setLocations(result.data.locations)
    })
  }, [app.workspaceId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void apiGet<Dashboard>(`/api/workspaces/${app.workspaceId}/dashboard?${params}`).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setData(result.data)
        // Periode yang dipakai server saat pertama dibuka diisikan ke filter,
        // supaya pengguna tahu angka yang tampil mencakup rentang yang mana.
        setFrom((value) => value || result.data.from)
        setTo((value) => value || result.data.to)
      } else {
        setData(null)
        setError(errorMessage(result.error, 'Dashboard tidak bisa dimuat.'))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [app.workspaceId, params])

  const adaBagian = data !== null
    && (data.access.stock || data.access.sales || data.access.purchasing || data.access.debts)
  const kosong = data !== null && adaBagian
    && data.cards.every((card) => card.value === 0)
    && data.actions.every((action) => action.items.length === 0)

  return (
    <AppShell workspaceName={app.workspaceName} roleLabel={app.roleLabel} activeHref="/dashboard" breadcrumb="Beranda" title="Dashboard">
      <section className={styles.content}>
        {error ? <ErrorState title="Dashboard tidak bisa dimuat" body={error} /> : null}
        {loading && !data ? <p role="status">Memuat dashboard.</p> : null}

        {data && adaBagian ? <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label htmlFor="tanggal-dari">Dari tanggal</label>
            <input id="tanggal-dari" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="tanggal-sampai">Sampai tanggal</label>
            <input id="tanggal-sampai" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="filter-lokasi">Lokasi</label>
            <select id="filter-lokasi" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Semua lokasi</option>
              {locations.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          {loading ? <p className={styles.loadingNote} role="status">Memperbarui angka.</p> : null}
        </div> : null}

        {data && !adaBagian ? <section className={styles.panel}>
          <h2>Ringkasan belum tersedia untuk peran Anda</h2>
          <p className={styles.panelText}>
            Peran Anda belum diberi akses ke laporan, jadi dashboard tidak bisa menampilkan ringkasan.
            Halaman kerja Anda tetap terbuka, misalnya:
          </p>
          <div className={styles.emptyActions}>
            <a href="/stok/input">Catat stok</a>
            <a href="/penjualan/baru">Catat penjualan</a>
            <a href="/stok/riwayat">Riwayat stok</a>
            <a href="/stok/opname">Stok opname</a>
          </div>
        </section> : null}

        {data && kosong ? <section className={styles.panel}>
          <h2>Belum ada catatan pada periode ini</h2>
          <p className={styles.panelText}>
            Angka di dashboard berasal dari catatan nyata di workspace ini, bukan contoh. Begitu ada barang,
            penjualan, atau pembelian, ringkasannya muncul di sini. Mulai dari langkah berikut.
          </p>
          <div className={styles.emptyActions}>
            <a href="/stok/produk/baru">Tambah barang</a>
            <a href="/penjualan/baru">Catat penjualan</a>
            <a href="/pembelian/po/baru">Buat purchase order</a>
          </div>
        </section> : null}

        {data && adaBagian && !kosong ? <>
          <ul className={styles.cardGrid}>
            {data.cards.map((card) => (
              <li key={card.key}>
                <a className={styles.card} href={card.href}>
                  <span className={styles.cardLabel}>{card.label}</span>
                  <strong className={styles.cardValue}>{formatNilai(card.value, card.format)}</strong>
                  <span className={styles.cardDefinition}>{card.definition}</span>
                </a>
              </li>
            ))}
          </ul>

          {data.trends.length > 0 ? <div className={styles.chartGrid}>
            {data.trends.map((trend) => <TrendPanel key={trend.key} trend={trend} />)}
          </div> : null}

          {data.stockStatus && data.stockStatus.rows.length > 0 ? <section className={styles.panel}>
            <h2>Distribusi status stok</h2>
            <p className={styles.panelText}>{data.stockStatus.summary}</p>
            <ul className={styles.statusList}>
              {data.stockStatus.rows.map((row) => {
                const total = data.stockStatus!.rows.reduce((sum, item) => sum + item.count, 0)
                return (
                  <li key={row.status} className={styles.statusRow}>
                    <span className={styles.statusLabel}>{row.label}</span>
                    <span className={styles.statusTrack} aria-hidden="true">
                      <span className={styles.statusFill} style={{ width: `${total === 0 ? 0 : (row.count / total) * 100}%` }} />
                    </span>
                    <span className={styles.statusCount}>{angka.format(row.count)} produk</span>
                  </li>
                )
              })}
            </ul>
          </section> : null}

          {data.actions.map((action) => <section key={action.key} className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>{action.title}</h2>
              <a className={styles.panelLink} href={action.href}>Lihat semua</a>
            </div>
            {action.items.length === 0
              ? <p className={styles.panelText}>{action.empty}</p>
              : <ul className={styles.actionList}>
                  {action.items.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      <a href={item.href}>{item.label}</a>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>}
          </section>)}
        </> : null}
      </section>
    </AppShell>
  )
}

function TrendPanel({ trend }: { trend: DashboardTrend }) {
  const total = trend.points.reduce((sum, point) => sum + point.value, 0)
  const max = Math.max(...trend.points.map((point) => point.value), 0)
  const caption = trend.points.length === 0
    ? ''
    : trend.points.length === 1
      ? trend.points[0]!.label
      : `${trend.points[0]!.label} sampai ${trend.points[trend.points.length - 1]!.label}`

  return (
    <section className={styles.panel}>
      <h2>{trend.title}</h2>
      <p className={styles.panelText}>{trend.summary}</p>
      {total > 0 ? <>
        {/* Arahkan pembaca layar ke ringkasan dan tabel; bilahnya hanya tampilan. */}
        <div className={styles.chart} aria-hidden="true">
          {trend.points.map((point) => (
            <span
              key={point.label}
              className={styles.bar}
              style={{ height: `${max === 0 ? 0 : Math.max(2, (point.value / max) * 100)}%` }}
              title={`${point.label}: ${formatNilai(point.value, trend.format)}`}
            />
          ))}
        </div>
        <p className={styles.chartCaption}>{caption}</p>
        <details className={styles.dataTable}>
          <summary>Lihat tabel data</summary>
          <table>
            <caption className={styles.visuallyHidden}>{trend.title}. {trend.summary}</caption>
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">{trend.format === 'rupiah' ? 'Nilai (Rp)' : 'Jumlah (satuan)'}</th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((point) => (
                <tr key={point.label}>
                  <td>{point.label}</td>
                  <td>{formatNilai(point.value, trend.format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </> : null}
    </section>
  )
}
