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
import styles from '../stok.module.css'

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
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void mulai()
        }}
      >
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="lokasi-opname">
            Lokasi yang dihitung
          </label>
          <select
            className={styles.select}
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
        <button type="submit" className={styles.submit} disabled={busy || locationId === ''}>
          {busy ? 'Memproses' : 'Mulai atau lanjutkan hitungan'}
        </button>
      </form>

      {loading ? (
        <p role="status">Memuat sesi opname.</p>
      ) : counts && counts.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada sesi opname</p>
          <p className={styles.stateBody}>
            Mulai sesi dari lokasi di atas, masukkan jumlah fisik, lalu setujui selisihnya
            menjadi transaksi penyesuaian.
          </p>
        </div>
      ) : null}

      {!loading && counts && counts.length > 0 ? (
        <ul className={styles.list}>
          {counts.map((item) => (
            <li key={item.countId} className={styles.card}>
              <span className={styles.cardName}>{item.locationName}</span>
              <span className={styles.cardMeta}>
                {statusLabel(item.status)} Â· {formatQty(item.countedItems ?? 0)} dari{' '}
                {formatQty(item.totalItems ?? 0)} barang sudah dihitung
              </span>
              <button
                type="button"
                className={styles.textButton}
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
        <section className={styles.state}>
          <h2 className={styles.cardName}>
            Sesi {selected.count.locationName} Â· {statusLabel(selected.count.status)}
          </h2>
          <p className={styles.stateBody}>
            Isi jumlah fisik yang dihitung. Selisih muncul begitu jumlahnya disimpan, dan saldo
            baru berubah setelah ada persetujuan.
          </p>

          <ul className={styles.list}>
            {selected.items.map((item) => (
              <li key={item.itemId} className={styles.card}>
                <span className={styles.cardName}>{item.productName}</span>
                <span className={styles.cardMeta}>
                  Sistem {formatQty(item.systemQuantity)} {item.unitCode}
                  {item.variance === null
                    ? ' Â· belum dihitung'
                    : ` Â· selisih ${item.variance > 0 ? '+' : ''}${formatQty(item.variance)}`}
                </span>
                <label className={styles.label} htmlFor={`hitung-${item.itemId}`}>
                  Jumlah fisik ({item.unitCode})
                </label>
                <input
                  className={styles.input}
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
              className={styles.submit}
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
