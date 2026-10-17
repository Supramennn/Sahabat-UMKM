'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { ErrorState } from '../../components/ui'
import {
  apiGet,
  errorMessage,
  type LocationsResponse,
  type StockMovement,
} from '../../../lib/api'
import { formatQty } from '../bagian'

/**
 * PRD 6.2: riwayat tidak dapat diubah atau dihapus, jadi halaman ini hanya
 * menyediakan pembacaan dan penyaring. Tidak ada tombol ubah atau hapus di sini,
 * karena koreksi dibuat sebagai catatan baru.
 */

export default function StockHistoryPage() {
  const app = useApp()

  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [locationId, setLocationId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then(
      (result) => {
        if (result.ok) setLocations(result.data.locations)
      },
    )
  }, [app.workspaceId])

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    const params = new URLSearchParams({ limit: '50' })
    if (locationId) params.set('locationId', locationId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)

    void apiGet<{ movements: StockMovement[] }>(
      `/api/workspaces/${app.workspaceId}/stock/movements?${params}`,
    ).then((result) => {
      if (berhenti) return
      if (result.ok) {
        setMovements(result.data.movements)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Riwayat tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, locationId, from, to])

  function onFilter(event: FormEvent) {
    event.preventDefault()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/riwayat"
      breadcrumb="Stok"
      title="Riwayat stok"
    >
      <form className="flex flex-wrap items-end gap-3" onSubmit={onFilter}>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="lokasi">
            Lokasi
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="lokasi"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Semua lokasi</option>
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="dari">
            Dari tanggal
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="dari"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="sampai">
            Sampai tanggal
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="sampai"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </form>

      {error ? <ErrorState title="Riwayat gagal dimuat" body={error} /> : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat riwayat stok.
        </p>
      ) : movements && movements.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada catatan stok</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Setiap barang yang masuk atau keluar akan tercatat di sini dengan tanggal, jumlah,
            alasan, dan saldo setelahnya.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/stok/input"
            >
              Catat stok pertama
            </a>
          </div>
        </div>
      ) : null}

      {!loading && movements && movements.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {movements.map((movement) => (
            <li
              key={movement.id}
              className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[1.0625rem] font-semibold text-primary">
                  {movement.kindLabel}
                </span>
                <span className="tabular font-bold">
                  {formatQty(movement.quantity)} {movement.unitCode}
                </span>
              </span>
              <span className="text-sm text-text-secondary">
                {movement.productName} · {movement.locationName}
              </span>
              <span className="text-sm text-text-secondary">
                Saldo {formatQty(movement.balanceBefore)} menjadi {formatQty(movement.balanceAfter)}
                {' · '}
                {movement.occurredOn}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  )
}
