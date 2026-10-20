'use client'

import { useEffect, useMemo, useState } from 'react'
import { can } from '@sahabat/shared'
import { useApp, AppProvider } from '../components/app-context'
import { AppShell } from '../components/shell'
import { DaftarPeriksaAktivasi } from '../components/daftar-periksa'
import { ErrorState } from '../components/ui'
import { apiGet, errorMessage, type LocationsResponse } from '../../lib/api'
import { cx } from '../../lib/cx'

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
    // Staf tidak boleh membaca daftar lokasi, jadi filter lokasi juga tidak
    // diminta supaya tidak ada permintaan yang pasti ditolak di konsol.
    if (!can(app.role, 'products.manage')) {
      setLocations([])
      return
    }
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) setLocations(result.data.locations)
    })
  }, [app.role, app.workspaceId])

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
      <section className="flex min-w-0 flex-col gap-6">
        {/* PRD 12: langkah aktivasi yang dilewati harus bisa ditemukan lagi lewat daftar periksa di dashboard. */}
        <DaftarPeriksaAktivasi />
        {error ? <ErrorState title="Dashboard tidak bisa dimuat" body={error} /> : null}
        {loading && !data ? <p className="rounded-surface border border-border-subtle bg-surface p-4 text-text-secondary shadow-raised" role="status">Memuat dashboard.</p> : null}

        {data && adaBagian ? <div className="flex flex-wrap items-end gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
            <label className="text-sm text-text-secondary" htmlFor="tanggal-dari">Dari tanggal</label>
            <input className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary" id="tanggal-dari" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
            <label className="text-sm text-text-secondary" htmlFor="tanggal-sampai">Sampai tanggal</label>
            <input className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary" id="tanggal-sampai" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          {can(app.role, 'products.manage') ? (
            <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
              <label className="text-sm text-text-secondary" htmlFor="filter-lokasi">Lokasi</label>
              <select className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary" id="filter-lokasi" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Semua lokasi</option>
                {locations.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          ) : null}
          {loading ? <p className="text-text-secondary" role="status">Memperbarui angka.</p> : null}
        </div> : null}

        {data && !adaBagian ? <section className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold">Ringkasan belum tersedia untuk peran Anda</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Peran Anda belum diberi akses ke laporan, jadi dashboard tidak bisa menampilkan ringkasan.
            Halaman kerja Anda tetap terbuka, misalnya:
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/stok/input">Catat stok</a>
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/penjualan/baru">Catat penjualan</a>
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/stok/riwayat">Riwayat stok</a>
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/stok/opname">Stok opname</a>
          </div>
        </section> : null}

        {data && kosong ? <section className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold">Belum ada catatan pada periode ini</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Angka di dashboard berasal dari catatan nyata di workspace ini, bukan contoh. Begitu ada barang,
            penjualan, atau pembelian, ringkasannya muncul di sini. Mulai dari langkah berikut.
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/stok/produk/baru">Tambah barang</a>
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/penjualan/baru">Catat penjualan</a>
            <a className="inline-flex min-h-touch items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary" href="/pembelian/po/baru">Buat purchase order</a>
          </div>
        </section> : null}

        {data && adaBagian && !kosong ? <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
            {data.cards.map((card) => (
              <li key={card.key}>
                <a className="flex h-full flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised transition-colors hover:border-primary focus-visible:border-primary" href={card.href}>
                  <span className="text-sm text-text-secondary">{card.label}</span>
                  <strong className="text-2xl font-semibold tabular text-primary">{formatNilai(card.value, card.format)}</strong>
                  <span className="text-sm text-text-secondary">{card.definition}</span>
                </a>
              </li>
            ))}
          </ul>

          {data.trends.length > 0 ? <div className="grid items-start grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
            {data.trends.map((trend) => <TrendPanel key={trend.key} trend={trend} />)}
          </div> : null}

          {data.stockStatus && data.stockStatus.rows.length > 0 ? <section className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <h2 className="text-lg font-semibold">Distribusi status stok</h2>
            <p className="text-[0.9375rem] text-text-secondary">{data.stockStatus.summary}</p>
            <ul className="flex flex-col gap-2">
              {data.stockStatus.rows.map((row) => {
                const total = data.stockStatus!.rows.reduce((sum, item) => sum + item.count, 0)
                return (
                  <li key={row.status} className="flex items-center gap-3">
                    <span className="basis-[6.5rem] shrink-0">{row.label}</span>
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-badge bg-border-subtle" aria-hidden="true">
                      <span
                        className={cx(
                          'absolute inset-y-0 left-0',
                          row.status === 'habis' && 'bg-danger',
                          row.status === 'stok_rendah' && 'bg-warning',
                          row.status === 'normal' && 'bg-success',
                        )}
                        style={{ width: `${total === 0 ? 0 : (row.count / total) * 100}%` }}
                      />
                    </span>
                    <span className="basis-24 shrink-0 text-right tabular text-text-secondary">{angka.format(row.count)} produk</span>
                  </li>
                )
              })}
            </ul>
          </section> : null}

          {data.actions.map((action) => <section key={action.key} className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{action.title}</h2>
              <a className="inline-flex min-h-touch items-center font-semibold text-secondary" href={action.href}>Lihat semua</a>
            </div>
            {action.items.length === 0
              ? <p className="text-[0.9375rem] text-text-secondary">{action.empty}</p>
              : <ul className="flex flex-col gap-2">
                  {action.items.map((item, index) => (
                    <li key={`${item.label}-${index}`} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2">
                      <a className="inline-flex min-h-touch w-fit items-center font-semibold text-secondary" href={item.href}>{item.label}</a>
                      <span className="text-[0.9375rem] text-text-secondary">{item.detail}</span>
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
    <section className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
      <h2 className="text-lg font-semibold">{trend.title}</h2>
      <p className="text-[0.9375rem] text-text-secondary">{trend.summary}</p>
      {total > 0 ? <>
        {/* Arahkan pembaca layar ke ringkasan dan tabel; bilahnya hanya tampilan. */}
        <div className="flex h-40 items-end gap-0.5 border-b border-border-strong pt-2" aria-hidden="true">
          {trend.points.map((point) => (
            <span
              key={point.label}
              className="min-w-0.5 flex-1 rounded-t-control bg-secondary-deep"
              style={{ height: `${max === 0 ? 0 : Math.max(2, (point.value / max) * 100)}%` }}
              title={`${point.label}: ${formatNilai(point.value, trend.format)}`}
            />
          ))}
        </div>
        <p className="text-[0.8125rem] text-text-secondary">{caption}</p>
        <details>
          <summary className="flex min-h-touch cursor-pointer items-center font-semibold text-secondary">Lihat tabel data</summary>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full border-collapse border-t border-border-subtle text-sm tabular">
              <caption className="visually-hidden">{trend.title}. {trend.summary}</caption>
              <thead className="bg-background text-text-secondary">
                <tr>
                  <th className="border-b border-border-subtle px-3 py-2 text-left font-semibold" scope="col">Tanggal</th>
                  <th className="border-b border-border-subtle px-3 py-2 text-left font-semibold" scope="col">{trend.format === 'rupiah' ? 'Nilai (Rp)' : 'Jumlah (satuan)'}</th>
                </tr>
              </thead>
              <tbody>
                {trend.points.map((point) => (
                  <tr key={point.label} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2 text-left">{point.label}</td>
                    <td className="px-3 py-2 text-left">{formatNilai(point.value, trend.format)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </> : null}
    </section>
  )
}
