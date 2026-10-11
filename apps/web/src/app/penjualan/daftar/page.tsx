'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import {
  apiGet,
  errorMessage,
  type Sale,
  type Customer,
  type Location,
} from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import { badgeFor, rupiah, statusLabel } from '../bagian'
import styles from '../penjualan.module.css'

const STATUS = [
  { value: 'all', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'cancelled', label: 'Dibatalkan' },
] as const

export default function SalesListPage() {
  const app = useApp()

  const [sales, setSales] = useState<Sale[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [status, setStatus] = useState('all')
  const [customerId, setCustomerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void apiGet<{ customers: Customer[] }>(`/api/workspaces/${app.workspaceId}/customers?includeArchived=true`).then(
      (result) => {
        if (result.ok) setCustomers(result.data.customers)
      },
    )
    void apiGet<{ locations: Location[] }>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) setLocations(result.data.locations.filter((l) => !l.archived))
    })
  }, [app.workspaceId])

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    const params = new URLSearchParams({ limit: '50' })
    if (status !== 'all') params.set('status', status)
    if (customerId) params.set('customerId', customerId)
    if (locationId) params.set('locationId', locationId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    void apiGet<{ sales: Sale[] }>(
      `/api/workspaces/${app.workspaceId}/sales?${params}`,
    ).then((result) => {
      if (berhenti) return
      if (result.ok) {
        setSales(result.data.sales)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Daftar penjualan tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, status, customerId, locationId, dateFrom, dateTo])

  return (
    <SalesShell activeHref="/penjualan/daftar" title="Daftar penjualan">
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="status">
            Status
          </label>
          <select className={styles.select} id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="pelanggan">
            Pelanggan
          </label>
          <select className={styles.select} id="pelanggan" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Semua pelanggan</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="lokasi">
            Lokasi
          </label>
          <select className={styles.select} id="lokasi" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Semua lokasi</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="dari">
            Dari tanggal
          </label>
          <input className={styles.input} id="dari" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="sampai">
            Sampai tanggal
          </label>
          <input className={styles.input} id="sampai" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar penjualan.</p>
      ) : sales && sales.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada penjualan</p>
          <p className={styles.stateBody}>
            Penjualan yang dicatat akan muncul di sini. Gunakan filter untuk menyaring data.
          </p>
        </div>
      ) : null}

      {!loading && sales && sales.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Daftar penjualan</caption>
              <thead>
                <tr>
                  <th scope="col">Nomor</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Lokasi</th>
                  <th scope="col">Metode</th>
                  <th scope="col" className={styles.numeric}>Total</th>
                  <th scope="col" className={styles.numeric}>Laba kotor</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><a href={`/penjualan/${sale.id}`}>{sale.number}</a></td>
                    <td className={styles.muted}>{sale.soldOn}</td>
                    <td className={styles.muted}>{sale.customerName ?? 'Pelanggan umum'}</td>
                    <td className={styles.muted}>{sale.locationName}</td>
                    <td className={styles.muted}>{sale.paymentMethod}</td>
                    <td className={styles.numeric}>{rupiah(sale.totalAmount)}</td>
                    <td className={styles.numeric}>{rupiah(sale.grossProfit)}</td>
                    <td><span className={badgeFor(sale.isCancelled ? 'cancelled' : 'active')}>{statusLabel(sale.isCancelled ? 'cancelled' : 'active')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </SalesShell>
  )
}