'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../components/app-context'
import { AppShell } from '../components/shell'
import { ErrorState } from '../components/ui'
import { API_BASE, apiGet, errorMessage, type LocationsResponse } from '../../lib/api'
import styles from './page.module.css'

type ReportKind = 'stock' | 'movements' | 'stocktake' | 'purchases' | 'debts' | 'sales' | 'gross-profit' | 'expenses' | 'monthly'
type Report = {
  kind: ReportKind
  title: string
  definition: string
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, string | number | null>>
}

const REPORTS: Array<{ kind: ReportKind; label: string }> = [
  { kind: 'stock', label: 'Posisi stok dan nilai persediaan' },
  { kind: 'movements', label: 'Pergerakan stok' },
  { kind: 'stocktake', label: 'Hasil stok opname' },
  { kind: 'purchases', label: 'Pembelian' },
  { kind: 'debts', label: 'Utang supplier dan umur utang' },
  { kind: 'sales', label: 'Penjualan per produk dan lokasi' },
  { kind: 'gross-profit', label: 'Laba kotor per produk' },
  { kind: 'expenses', label: 'Pengeluaran operasional' },
  { kind: 'monthly', label: 'Ringkasan bulanan' },
]
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const rupiahColumns = new Set(['averageCost', 'inventoryValue', 'receivedValue', 'returnedValue', 'netValue', 'debt', 'paid', 'outstanding', 'sales', 'cost', 'grossProfit', 'amount', 'purchases', 'expenses'])

export default function ReportsPage() {
  const app = useApp()
  const [kind, setKind] = useState<ReportKind>('stock')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [locationId, setLocationId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const params = useMemo(() => {
    const value = new URLSearchParams()
    if (from) value.set('from', from)
    if (to) value.set('to', to)
    if (locationId) value.set('locationId', locationId)
    if (supplierId) value.set('supplierId', supplierId)
    return value
  }, [from, locationId, supplierId, to])

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) setLocations(result.data.locations)
    })
    void apiGet<{ suppliers: Array<{ id: number; name: string }> }>(`/api/workspaces/${app.workspaceId}/suppliers`).then((result) => {
      if (result.ok) setSuppliers(result.data.suppliers)
    })
  }, [app.workspaceId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void apiGet<Report>(`/api/workspaces/${app.workspaceId}/reports/${kind}?${params}`).then((result) => {
      if (cancelled) return
      if (result.ok) setReport(result.data)
      else {
        setReport(null)
        setError(errorMessage(result.error, 'Laporan tidak bisa dimuat.'))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [app.workspaceId, kind, params])

  async function download(format: 'csv' | 'xlsx') {
    setExporting(true)
    setExportError(null)
    try {
      const query = new URLSearchParams(params)
      query.set('format', format)
      const response = await fetch(`${API_BASE}/api/workspaces/${app.workspaceId}/reports/${kind}/export?${query}`, { credentials: 'include' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        setExportError(body.message ?? 'Berkas laporan tidak dapat dibuat.')
        return
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `laporan.${format}`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setExportError('Tidak bisa menghubungi server untuk membuat berkas.')
    } finally {
      setExporting(false)
    }
  }

  const showDate = !['stock', 'debts'].includes(kind)
  const showLocation = ['stock', 'movements', 'stocktake', 'purchases', 'sales', 'gross-profit'].includes(kind)
  const showSupplier = ['purchases', 'debts'].includes(kind)

  return (
    <AppShell workspaceName={app.workspaceName} roleLabel={app.roleLabel} activeHref="/laporan" breadcrumb="Laporan" title="Laporan usaha">
      <section className={styles.content}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label htmlFor="jenis-laporan">Jenis laporan</label>
            <select id="jenis-laporan" value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}>
              {REPORTS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
            </select>
          </div>
          {showDate ? <>
            <div className={styles.filterGroup}><label htmlFor="tanggal-dari">Dari tanggal</label><input id="tanggal-dari" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
            <div className={styles.filterGroup}><label htmlFor="tanggal-sampai">Sampai tanggal</label><input id="tanggal-sampai" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
          </> : null}
          {showLocation ? <div className={styles.filterGroup}>
            <label htmlFor="filter-lokasi">Lokasi</label>
            <select id="filter-lokasi" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Semua lokasi</option>
              {locations.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div> : null}
          {showSupplier ? <div className={styles.filterGroup}>
            <label htmlFor="filter-supplier">Supplier</label>
            <select id="filter-supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Semua supplier</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div> : null}
        </div>

        {error ? <ErrorState title="Laporan tidak bisa dimuat" body={error} /> : null}
        {exportError ? <ErrorState title="Ekspor tidak berhasil" body={exportError} /> : null}
        {loading ? <p role="status">Memuat laporan.</p> : null}
        {!loading && report ? <>
          <div className={styles.reportHeader}>
            <div><h2>{report.title}</h2><p>{report.definition}</p></div>
            <div className={styles.actions} aria-label="Aksi laporan">
              <button type="button" onClick={() => window.print()}>Cetak</button>
              <button type="button" disabled={exporting} onClick={() => void download('csv')}>Unduh CSV</button>
              <button type="button" disabled={exporting} onClick={() => void download('xlsx')}>Unduh XLSX</button>
            </div>
          </div>
          {report.rows.length === 0 ? <p className={styles.empty}>Tidak ada data yang cocok dengan filter ini.</p> : <div className={styles.tableWrap}>
            <table>
              <caption className={styles.visuallyHidden}>{report.title}. {report.definition}</caption>
              <thead><tr>{report.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
              <tbody>{report.rows.map((row, index) => <tr key={index}>{report.columns.map((column) => {
                const value = row[column.key]
                const display = typeof value === 'number' && rupiahColumns.has(column.key) ? rupiah.format(value) : value ?? 'Tidak tersedia'
                return <td key={column.key}>{display}</td>
              })}</tr>)}</tbody>
            </table>
          </div>}
          {kind === 'monthly' || kind === 'gross-profit' ? <p className={styles.note}>Laporan ini tidak menampilkan laba bersih dan bukan pengganti akuntansi.</p> : null}
        </> : null}
      </section>
    </AppShell>
  )
}
