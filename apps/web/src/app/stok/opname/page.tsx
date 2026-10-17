'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  apiPut,
  errorMessage,
  type LocationsResponse,
  type StockCount,
  type StockCountDetail,
} from '../../../lib/api'
import { formatQty } from '../bagian'

/**
 * PRD 6.2: Owner atau Admin membuka sesi hitung untuk satu lokasi, staf
 * memasukkan jumlah fisik, sistem menampilkan selisih, dan persetujuan
 * menghasilkan transaksi penyesuaian. Sesi bisa dilanjutkan di hari berikutnya.
 *
 * Karena itu daftar sesi memuat progres: berapa barang sudah dihitung dari total
 * yang dihitung.
 */

export default function StockCountPage() {
  const app = useApp()

  const [counts, setCounts] = useState<StockCount[] | null>(null)
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [selected, setSelected] = useState<StockCountDetail | null>(null)
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const result = await apiGet<{ counts: StockCount[] }>(`/api/workspaces/${app.workspaceId}/stock/counts`)
    if (result.ok) {
      setCounts(result.data.counts)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar sesi opname tidak bisa dimuat.'))
    }
    setLoading(false)
  }

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (!result.ok) return
      const aktif = result.data.locations.filter((item) => !item.archived)
      setLocations(aktif)
      setLocationId(String(aktif[0]?.id ?? ''))
    })
  }, [app.workspaceId])

  useEffect(() => {
    void load()
  }, [app.workspaceId])

  async function mulai() {
    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPost<{ countId: number; resumed: boolean }>(
      `/api/workspaces/${app.workspaceId}/stock/counts`,
      { locationId: Number(locationId) },
    )
    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Sesi opname tidak bisa dimulai.'))
      return
    }

    setSuccess(
      result.data.resumed
        ? 'Sesi yang terbuka dilanjutkan, jadi tidak ada dua penghitungan untuk lokasi yang sama.'
        : 'Sesi opname dimulai.',
    )
    await load()
    await buka(result.data.countId)
  }

  async function buka(countId: number) {
    const result = await apiGet<StockCountDetail>(
      `/api/workspaces/${app.workspaceId}/stock/counts/${countId}`,
    )
    if (result.ok) {
      setSelected(result.data)
    } else {
      setError(errorMessage(result.error, 'Sesi opname tidak bisa dimuat.'))
    }
  }

  async function simpan(itemProductId: number, value: string) {
    if (value.trim() === '') return

    const result = await apiPut<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/stock/counts/${selected?.count.countId}/items/${itemProductId}`,
      { countedQuantity: value },
    )
    if (!result.ok) {
      setError(errorMessage(result.error, 'Jumlah fisik tidak bisa disimpan.'))
      return
    }
    await buka(selected!.count.countId)
  }

  async function setujui() {
    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPost<{ adjustments: number; message: string }>(
      `/api/workspaces/${app.workspaceId}/stock/counts/${selected?.count.countId}/approve`,
    )
    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Selisih tidak bisa disetujui.'))
      return
    }

    setSuccess(result.data.message)
    await buka(selected!.count.countId)
    await load()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/opname"
      breadcrumb="Stok"
      title="Stok opname"
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      <form
        className="flex max-w-[34rem] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void mulai()
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="lokasi-opname">
            Lokasi yang dihitung
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="lokasi-opname"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy || locationId === ''}
        >
          {busy ? 'Memproses' : 'Mulai atau lanjutkan hitungan'}
        </button>
      </form>

      {loading ? (
        <p role="status">Memuat sesi opname.</p>
      ) : counts && counts.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold text-text-primary">Belum ada sesi opname</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Mulai sesi dari lokasi di atas, masukkan jumlah fisik, lalu setujui selisihnya
            menjadi transaksi penyesuaian.
          </p>
        </div>
      ) : null}

      {!loading && counts && counts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {counts.map((item) => (
            <li
              key={item.countId}
              className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
            >
              <span className="font-semibold text-primary">{item.locationName}</span>
              <span className="text-sm text-text-secondary">
                {statusLabel(item.status)} · {formatQty(item.countedItems ?? 0)} dari{' '}
                {formatQty(item.totalItems ?? 0)} barang sudah dihitung
              </span>
              <button
                type="button"
                className="min-h-touch self-start cursor-pointer bg-transparent px-2 text-left text-[0.9375rem] text-secondary underline enabled:hover:decoration-2 disabled:cursor-not-allowed disabled:text-text-secondary"
                onClick={() => {
                  void buka(item.countId)
                }}
              >
                Buka sesi ini
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <section className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold text-primary">
            Sesi {selected.count.locationName} · {statusLabel(selected.count.status)}
          </h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Isi jumlah fisik yang dihitung. Selisih muncul begitu jumlahnya disimpan, dan saldo
            baru berubah setelah ada persetujuan.
          </p>

          <ul className="flex flex-col gap-2">
            {selected.items.map((item) => (
              <li
                key={item.itemId}
                className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              >
                <span className="font-semibold text-primary">{item.productName}</span>
                <span className="text-sm text-text-secondary">
                  Sistem {formatQty(item.systemQuantity)} {item.unitCode}
                  {item.variance === null
                    ? ' · belum dihitung'
                    : ` · selisih ${item.variance > 0 ? '+' : ''}${formatQty(item.variance)}`}
                </span>
                <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor={`hitung-${item.itemId}`}>
                  Jumlah fisik ({item.unitCode})
                </label>
                <input
                  className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                  id={`hitung-${item.itemId}`}
                  inputMode="decimal"
                  defaultValue={item.counted ? String(item.countedQuantity) : ''}
                  disabled={selected.count.status !== 'draf'}
                  onBlur={(event) => {
                    void simpan(item.productId, event.target.value)
                  }}
                />
              </li>
            ))}
          </ul>

          {selected.count.status === 'draf' ? (
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              disabled={busy}
              onClick={() => {
                void setujui()
              }}
            >
              {busy ? 'Memproses' : 'Setujui dan catat penyesuaian'}
            </button>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  )
}

function statusLabel(status: string): string {
  if (status === 'draf') return 'Draft'
  if (status === 'selesai') return 'Selesai'
  if (status === 'disetujui') return 'Disetujui'
  return status
}
