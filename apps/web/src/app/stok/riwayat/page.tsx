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
import styles from '../stok.module.css'

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
      <form className={styles.filters} onSubmit={onFilter}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="lokasi">
            Lokasi
          </label>
          <select
            className={styles.select}
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
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="dari">
            Dari tanggal
          </label>
          <input
            className={styles.input}
            id="dari"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="sampai">
            Sampai tanggal
          </label>
          <input
            className={styles.input}
            id="sampai"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </form>

      {error ? <ErrorState title="Riwayat gagal dimuat" body={error} /> : null}

      {loading ? (
        <p role="status">Memuat riwayat stok.</p>
      ) : movements && movements.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada catatan stok</p>
          <p className={styles.stateBody}>
            Setiap barang yang masuk atau keluar akan tercatat di sini dengan tanggal, jumlah,
            alasan, dan saldo setelahnya.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.paginationLink} href="/stok/input">
              Catat stok pertama
            </a>
          </div>
        </div>
      ) : null}

      {!loading && movements && movements.length > 0 ? (
        <ul className={styles.list}>
          {movements.map((movement) => (
            <li key={movement.id} className={styles.card}>
              <span className={styles.cardRow}>
                <span className={styles.cardName}>{movement.kindLabel}</span>
                <span className={styles.quantity}>
                  {formatQty(movement.quantity)} {movement.unitCode}
                </span>
              </span>
              <span className={styles.cardMeta}>
                {movement.productName} Â· {movement.locationName}
              </span>
              <span className={styles.cardMeta}>
                Saldo {formatQty(movement.balanceBefore)} menjadi {formatQty(movement.balanceAfter)}
                {' Â· '}
                {movement.occurredOn}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  )
}
