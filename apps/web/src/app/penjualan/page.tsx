'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '../components/app-context'
import { ErrorState } from '../components/ui'
import { apiGet, errorMessage, type Location, type LocationsResponse, type Sale, type SalesResponse } from '../../lib/api'
import { SalesShell } from './penjualan-shell'
import { Pagination, badgeFor, rupiah } from './bagian'
import styles from './penjualan.module.css'

/**
 * PRD 5: Penjualan > Daftar Penjualan. PRD 6.4: penjualan mengurangi stok di lokasi
 * yang dipilih, jadi daftar ini juga menampilkan lokasi dan stok barang yang terjual.
 *
 * Halaman ini punya tiga keadaan: memuat, kosong dengan langkah berikutnya, dan galat
 * dengan tindakan yang bisa dicoba (PRD 10).
 */

const PAGE_SIZE = 50

export default function SalesPage() {
  const app = useApp()

  const [sales, setSales] = useState<Sale[] | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const muat = useCallback(async () => {
    setLoading(true)
    const parameter = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (locationId) parameter.set('locationId', locationId)
    if (dari) parameter.set('from', dari)
    if (sampai) parameter.set('to', sampai)

    const hasil = await apiGet<SalesResponse>(
      `/api/workspaces/${app.workspaceId}/sales?${parameter.toString()}`,
    )

    setLoading(false)
    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Daftar penjualan tidak bisa dimuat.'))
      return
    }
    setError(null)
    setSales(hasil.data.sales)
    setTotal(hasil.data.pagination.total)
  }, [app.workspaceId, dari, locationId, offset, sampai])

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((hasil) => {
      if (hasil.ok) setLocations(hasil.data.locations)
    })
  }, [app.workspaceId])

  useEffect(() => {
    void muat()
  }, [muat])

  const totalPenjualan = sales?.reduce((total, sale) => total + sale.totalAmount, 0) ?? 0

  return (
    <SalesShell
      activeHref="/penjualan"
      title="Daftar penjualan"
      actions={
        <Link className={styles.submit} href="/penjualan/baru">
          Catat penjualan
        </Link>
      }
    >
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-lokasi">
            Lokasi
          </label>
          <select
            className={styles.select}
            id="filter-lokasi"
            value={locationId}
            onChange={(event) => {
              setOffset(0)
              setLocationId(event.target.value)
            }}
          >
            <option value="">Semua lokasi</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-dari">
            Dari tanggal
          </label>
          <input
            className={styles.input}
            id="filter-dari"
            type="date"
            value={dari}
            onChange={(event) => {
              setOffset(0)
              setDari(event.target.value)
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-sampai">
            Sampai tanggal
          </label>
          <input
            className={styles.input}
            id="filter-sampai"
            type="date"
            value={sampai}
            onChange={(event) => {
              setOffset(0)
              setSampai(event.target.value)
            }}
          />
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Daftar penjualan gagal dimuat"
          body={error}
          action={
            <button type="button" className={styles.linkButton} onClick={() => void muat()}>
              Coba lagi
            </button>
          }
        />
      ) : null}

      {loading ? <p role="status">Memuat daftar penjualan.</p> : null}

      {!loading && !error && sales && sales.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada penjualan</p>
          <p className={styles.stateBody}>
            Penjualan dicatat satu per satu supaya laba kotor setiap transaksi bisa ditelusuri
            sampai harga pokok barangnya. Kalau datanya sudah ada dari aplikasi kasir, impor dari
            berkas saja lebih cepat.
          </p>
          <div className={styles.emptyActions}>
            <Link className={styles.submit} href="/penjualan/baru">
              Catat penjualan
            </Link>
            <Link className={styles.linkButton} href="/penjualan/impor">
              Impor dari berkas
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && sales && sales.length > 0 ? (
        <>
          <div className={styles.summary}>
            <div>
              <p className={styles.summaryLabel}>Penjualan pada halaman ini</p>
              <p className={styles.summaryValue}>{rupiah(totalPenjualan)}</p>
            </div>
            <div>
              <p className={styles.summaryLabel}>Jumlah data</p>
              <p className={styles.summaryValue}>{total}</p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>
                Daftar penjualan beserta lokasi, metode pembayaran, dan totalnya
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nomor</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Lokasi</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Metode</th>
                  <th scope="col" className={styles.numeric}>
                    Total
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link href={`/penjualan/${sale.id}`}>{sale.number}</Link>
                    </td>
                    <td>{sale.soldOn}</td>
                    <td>{sale.locationName}</td>
                    <td>{sale.customerName ?? 'Pelanggan umum'}</td>
                    <td>{sale.paymentMethodLabel}</td>
                    <td className={styles.numeric}>{rupiah(sale.totalAmount)}</td>
                    <td>
                      <span className={badgeFor(sale.status)}>{sale.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.list}>
            {sales.map((sale) => (
              <li key={sale.id}>
                <Link className={styles.card} href={`/penjualan/${sale.id}`}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{sale.number}</span>
                    <span className={badgeFor(sale.status)}>{sale.statusLabel}</span>
                  </span>
                  <span className={styles.cardRow}>
                    <span className={styles.cardMeta}>
                      {sale.soldOn} · {sale.locationName} · {sale.paymentMethodLabel}
                    </span>
                    <span className={styles.cardTotal}>{rupiah(sale.totalAmount)}</span>
                  </span>
                  <span className={styles.cardMeta}>
                    {sale.customerName ?? 'Pelanggan umum'} · {sale.itemCount} barang · laba{' '}
                    {rupiah(sale.grossProfit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      ) : null}
    </SalesShell>
  )
}