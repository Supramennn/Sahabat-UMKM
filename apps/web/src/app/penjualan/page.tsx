'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '../components/app-context'
import { ErrorState } from '../components/ui'
import { apiGet, errorMessage, type Location, type LocationsResponse, type Sale, type SalesResponse } from '../../lib/api'
import { SalesShell } from './penjualan-shell'
import { Pagination, badgeFor, rupiah } from './bagian'

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
        <Link
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 font-medium text-surface transition-colors hover:bg-secondary-deep"
          href="/penjualan/baru"
        >
          Catat penjualan
        </Link>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-lokasi">
            Lokasi
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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

        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-dari">
            Dari tanggal
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="filter-dari"
            type="date"
            value={dari}
            onChange={(event) => {
              setOffset(0)
              setDari(event.target.value)
            }}
          />
        </div>

        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-sampai">
            Sampai tanggal
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              onClick={() => void muat()}
            >
              Coba lagi
            </button>
          }
        />
      ) : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar penjualan.
        </p>
      ) : null}

      {!loading && !error && sales && sales.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada penjualan</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Penjualan dicatat satu per satu supaya laba kotor setiap transaksi bisa ditelusuri
            sampai harga pokok barangnya. Kalau datanya sudah ada dari aplikasi kasir, impor dari
            berkas saja lebih cepat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 font-medium text-surface transition-colors hover:bg-secondary-deep"
              href="/penjualan/baru"
            >
              Catat penjualan
            </Link>
            <Link
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/penjualan/impor"
            >
              Impor dari berkas
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && sales && sales.length > 0 ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <div>
              <p className="text-[0.9375rem] text-text-secondary">Penjualan pada halaman ini</p>
              <p className="text-2xl font-semibold tabular">{rupiah(totalPenjualan)}</p>
            </div>
            <div>
              <p className="text-[0.9375rem] text-text-secondary">Jumlah data</p>
              <p className="text-2xl font-semibold tabular">{total}</p>
            </div>
          </div>

          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full text-sm">
              <caption className="visually-hidden">
                Daftar penjualan beserta lokasi, metode pembayaran, dan totalnya
              </caption>
              <thead className="bg-background text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Nomor
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Tanggal
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Lokasi
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Pelanggan
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Metode
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-3 py-2">
                      <Link href={`/penjualan/${sale.id}`}>{sale.number}</Link>
                    </td>
                    <td className="px-3 py-2">{sale.soldOn}</td>
                    <td className="px-3 py-2">{sale.locationName}</td>
                    <td className="px-3 py-2">{sale.customerName ?? 'Pelanggan umum'}</td>
                    <td className="px-3 py-2">{sale.paymentMethodLabel}</td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(sale.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={badgeFor(sale.status)}>{sale.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0 desktop:hidden">
            {sales.map((sale) => (
              <li key={sale.id}>
                <Link
                  className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary shadow-raised"
                  href={`/penjualan/${sale.id}`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[1.0625rem] font-semibold text-primary">{sale.number}</span>
                    <span className={badgeFor(sale.status)}>{sale.statusLabel}</span>
                  </span>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-text-secondary">
                      {sale.soldOn} · {sale.locationName} · {sale.paymentMethodLabel}
                    </span>
                    <span className="font-semibold tabular">{rupiah(sale.totalAmount)}</span>
                  </span>
                  <span className="text-sm text-text-secondary">
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
