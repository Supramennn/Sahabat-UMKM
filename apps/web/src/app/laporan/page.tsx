'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp, AppProvider } from '../components/app-context'
import { AppShell } from '../components/shell'
import { ErrorState } from '../components/ui'
import { API_BASE, apiGet, errorMessage, type LocationsResponse } from '../../lib/api'

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
const actionButtonClass = 'min-h-touch grow basis-32 cursor-pointer rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface sm:grow-0 sm:basis-auto'
const fieldClass = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary'
const filterGroupClass = 'flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1'

export default function ReportsPage() {
  return (
    <AppProvider title="Laporan usaha">
      <ReportsPageContent />
    </AppProvider>
  )
}

function ReportsPageContent() {
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
      <section className="flex min-w-0 flex-col gap-6 print:overflow-visible">
        <div className="flex flex-wrap items-end gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised print:hidden">
          <div className={filterGroupClass}>
            <label className="text-sm text-text-secondary" htmlFor="jenis-laporan">Jenis laporan</label>
            <select className={fieldClass} id="jenis-laporan" value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}>
              {REPORTS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
            </select>
          </div>
          {showDate ? <>
            <div className={filterGroupClass}><label className="text-sm text-text-secondary" htmlFor="tanggal-dari">Dari tanggal</label><input className={fieldClass} id="tanggal-dari" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
            <div className={filterGroupClass}><label className="text-sm text-text-secondary" htmlFor="tanggal-sampai">Sampai tanggal</label><input className={fieldClass} id="tanggal-sampai" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
          </> : null}
          {showLocation ? <div className={filterGroupClass}>
            <label className="text-sm text-text-secondary" htmlFor="filter-lokasi">Lokasi</label>
            <select className={fieldClass} id="filter-lokasi" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Semua lokasi</option>
              {locations.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div> : null}
          {showSupplier ? <div className={filterGroupClass}>
            <label className="text-sm text-text-secondary" htmlFor="filter-supplier">Supplier</label>
            <select className={fieldClass} id="filter-supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Semua supplier</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div> : null}
        </div>

        {error ? <ErrorState title="Laporan tidak bisa dimuat" body={error} /> : null}
        {exportError ? <ErrorState title="Ekspor tidak berhasil" body={exportError} /> : null}
        {loading ? <p className="rounded-surface border border-border-subtle bg-surface p-4 text-text-secondary shadow-raised" role="status">Memuat laporan.</p> : null}
        {!loading && report ? <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[54rem]"><h2 className="mb-1 text-xl font-semibold">{report.title}</h2><p className="text-[0.9375rem] text-text-secondary">{report.definition}</p></div>
            <div className="flex flex-wrap gap-2 print:hidden" aria-label="Aksi laporan">
              <button className={actionButtonClass} type="button" onClick={() => window.print()}>Cetak</button>
              <button className={actionButtonClass} type="button" disabled={exporting} onClick={() => void download('csv')}>Unduh CSV</button>
              <button className={actionButtonClass} type="button" disabled={exporting} onClick={() => void download('xlsx')}>Unduh XLSX</button>
            </div>
          </div>
          {report.rows.length === 0 ? <p className="rounded-surface border border-border-subtle bg-surface p-6 text-text-secondary shadow-raised">Tidak ada data yang cocok dengan filter ini.</p> : <div className="max-w-full overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised print:overflow-visible print:border-0 print:shadow-none">
            <table className="w-full border-collapse text-sm tabular print:text-[9pt]">
              <caption className="visually-hidden">{report.title}. {report.definition}</caption>
              <thead className="bg-background text-text-secondary"><tr>{report.columns.map((column) => <th key={column.key} scope="col" className="min-w-28 whitespace-nowrap border-b border-border-subtle px-3 py-2 text-left font-semibold">{column.label}</th>)}</tr></thead>
              <tbody>{report.rows.map((row, index) => <tr key={index} className="border-b border-border-subtle last:border-0">{report.columns.map((column) => {
                const value = row[column.key]
                const display = typeof value === 'number' && rupiahColumns.has(column.key) ? rupiah.format(value) : value ?? 'Tidak tersedia'
                return <td key={column.key} className="min-w-28 px-3 py-2 text-left align-top">{display}</td>
              })}</tr>)}</tbody>
            </table>
          </div>}
          {kind === 'monthly' || kind === 'gross-profit' ? <p className="text-sm text-text-secondary">Laporan ini tidak menampilkan laba bersih dan bukan pengganti akuntansi.</p> : null}
        </> : null}
      </section>
    </AppShell>
  )
}
