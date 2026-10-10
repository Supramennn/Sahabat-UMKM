'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { ErrorState } from '../../components/ui'
import { apiGet, errorMessage, type StockAlert, type AlertsResponse } from '../../../lib/api'
import { badgeClass, formatQty } from '../bagian'
import styles from '../stok.module.css'

/**
 * PRD 6.2: peringatan stok rendah dan hampir kedaluwarsa memakai batas yang diatur
 * per produk. Batas minimum ada di setiap barang, sedangkan jendela kedaluwarsa
 * belum ditetapkan PRD, jadi dipilih pengguna dari 7, 30, dan 90 hari.
 *
 * Daftar ini juga jadi bahan awal untuk membuat PO dari stok rendah (PRD 6.3), jadi
 * keadaan kosongnya menjelaskan langkah berikutnya, bukan hanya menampilkan nol.
 */

const JENDELA_HARI = [7, 30, 90] as const

export default function StockAlertsPage() {
  const app = useApp()

  const [alerts, setAlerts] = useState<StockAlert[] | null>(null)
  const [withinDays, setWithinDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    void apiGet<AlertsResponse>(
      `/api/workspaces/${app.workspaceId}/stock/alerts?withinDays=${withinDays}`,
    ).then((result) => {
      if (berhenti) return
      if (result.ok) {
        setAlerts(result.data.alerts)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Daftar peringatan tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, withinDays])

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/peringatan"
      breadcrumb="Stok"
      title="Perlu perhatian"
    >
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="jendela">
            Hampir kedaluwarsa dalam
          </label>
          <select
            className={styles.select}
            id="jendela"
            value={withinDays}
            onChange={(event) => setWithinDays(Number(event.target.value))}
          >
            {JENDELA_HARI.map((hari) => (
              <option key={hari} value={hari}>
                {hari} hari
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <ErrorState title="Peringatan gagal dimuat" body={error} /> : null}

      {loading ? (
        <p role="status">Memuat daftar peringatan.</p>
      ) : alerts && alerts.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Tidak ada yang perlu diperhatikan</p>
          <p className={styles.stateBody}>
            Tidak ada barang yang habis, menyentuh batas minimum, atau hampir kedaluwarsa
            dalam {withinDays} hari ke depan. Daftar ini diperbarui setiap kali Anda mencatat
            stok.
          </p>
        </div>
      ) : null}

      {!loading && alerts && alerts.length > 0 ? (
        <ul className={styles.list}>
          {alerts.map((item) => (
            <li key={`${item.productId}-${item.locationId}`} className={styles.card}>
              <span className={styles.cardRow}>
                <span className={styles.cardName}>{item.productName}</span>
                <span className={`${styles.badge} ${badgeClass(item.status)}`}>
                  {item.statusLabel}
                </span>
              </span>
              <span className={styles.cardMeta}>
                {item.locationName} · {formatQty(item.quantity)} {item.unitCode}
                {item.minStock !== null ? ` dari batas minimum ${formatQty(item.minStock)}` : ''}
              </span>
              <ul className={styles.reasonList}>
                {item.reasons.map((reason) => (
                  <li key={reason} className={styles.reason}>
                    {ALASAN[reason] ?? reason}
                  </li>
                ))}
                {item.earliestExpiry ? (
                  <li className={styles.reason}>
                    Kedaluwarsa pertama {item.earliestExpiry}
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  )
}

const ALASAN: Record<string, string> = {
  stok_habis: 'Stok habis',
  stok_rendah: 'Sudah menyentuh batas minimum',
  hampir_kedaluwarsa: 'Hampir kedaluwarsa',
}
