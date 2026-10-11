'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import { apiGet, errorMessage, type Sale, type Expense } from '@/lib/api'
import { SalesShell } from './penjualan-shell'
import { rupiah } from './bagian'
import styles from './penjualan.module.css'

/**
 * Ringkasan Penjualan (PRD 6.7).
 * Kartu: penjualan hari ini, laba kotor, pengeluaran, pelanggan baru.
 * Daftar tindakan: penjualan dibatalkan, pengeluaran tanpa kategori.
 */

export default function SalesOverviewPage() {
  const app = useApp()

  const [sales, setSales] = useState<Sale[] | null>(null)
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const firstOfMonth = new Date()
    firstOfMonth.setDate(1)
    const monthStart = firstOfMonth.toISOString().slice(0, 10)

    void apiGet<{ sales: Sale[] }>(
      `/api/workspaces/${app.workspaceId}/sales?dateFrom=${monthStart}&dateTo=${today}&limit=100`,
    ).then((result) => {
      if (result.ok) {
        setSales(result.data.sales)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Data penjualan tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    void apiGet<{ expenses: Expense[] }>(
      `/api/workspaces/${app.workspaceId}/expenses?dateFrom=${monthStart}&dateTo=${today}&limit=100`,
    ).then((result) => {
      if (result.ok) setExpenses(result.data.expenses)
    })
  }, [app.workspaceId])

  const activeSales = (sales ?? []).filter((s) => !s.isCancelled)
  const cancelledSales = (sales ?? []).filter((s) => s.isCancelled)
  const totalPenjualan = activeSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalLabaKotor = activeSales.reduce((sum, s) => sum + s.grossProfit, 0)
  const totalPengeluaran = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0)
  const pelangganUnik = new Set(activeSales.map((s) => s.customerId).filter(Boolean)).size

  return (
    <SalesShell activeHref="/penjualan" title="Penjualan">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <div className={styles.actions}>
        <div className={styles.card}>
          <p className={styles.cardMeta}>Penjualan bulan ini</p>
          <p className={styles.cardValue}>{rupiah(totalPenjualan)}</p>
          <p className={styles.cardSub}>dari {activeSales.length} transaksi</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardMeta}>Laba kotor</p>
          <p className={styles.cardValue}>{rupiah(totalLabaKotor)}</p>
          <p className={styles.cardSub}>
            margin {totalPenjualan > 0 ? Math.round((totalLabaKotor / totalPenjualan) * 100) : 0}%
          </p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardMeta}>Pengeluaran</p>
          <p className={styles.cardValue}>{rupiah(totalPengeluaran)}</p>
          <p className={styles.cardSub}>{expenses?.length ?? 0} transaksi</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardMeta}>Pelanggan aktif</p>
          <p className={styles.cardValue}>{pelangganUnik}</p>
          <p className={styles.cardSub}>yang bertransaksi bulan ini</p>
        </div>
      </div>

      {loading ? (
        <p role="status">Memuat ringkasan penjualan.</p>
      ) : sales && sales.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada penjualan</p>
          <p className={styles.stateBody}>
            Catat penjualan pertama untuk mulai melihat laporan. Data penjualan akan muncul di sini
            dan di halaman Laporan.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.paginationLink} href="/penjualan/baru">
              Catat penjualan
            </a>
            <a className={styles.paginationLink} href="/penjualan/pelanggan">
              Tambah pelanggan
            </a>
          </div>
        </div>
      ) : null}

      {!loading && cancelledSales.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Perlu perhatian</h2>
          <p className={styles.hint}>
            {cancelledSales.length} penjualan dibatalkan bulan ini. Periksa apakah stok sudah
            dikembalikan dengan benar.
          </p>
        </>
      ) : null}

      {!loading && activeSales.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Penjualan terbaru</h2>
          <ul className={styles.list}>
            {activeSales.slice(0, 10).map((sale) => (
              <li key={sale.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{sale.number}</span>
                  <span className={styles.badge} style={{ background: '#dcfce7', color: '#166534' }}>
                    {rupiah(sale.totalAmount)}
                  </span>
                </span>
                <span className={styles.cardMeta}>
                  {sale.customerName ?? 'Pelanggan umum'} · {sale.paymentMethod} · {sale.soldOn}
                </span>
                <span className={styles.cardMeta}>
                  Laba kotor {rupiah(sale.grossProfit)} · {sale.locationName}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SalesShell>
  )
}