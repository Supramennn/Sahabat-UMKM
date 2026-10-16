'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../components/app-context'
import { Alert } from '../components/ui'
import { apiGet, errorMessage, type PurchaseOrder, type SupplierDebt, type SubscriptionResponse } from '../../lib/api'
import { PurchasingShell } from './pembelian-shell'
import { formatQty, rupiah } from './bagian'
import styles from './pembelian.module.css'
import { can } from '@sahabat/shared'

/**
 * Pembelian dalam satu layar: PO yang menunggu keputusan, PO yang sedang berjalan,
 * dan utang yang sudah lewat jatuh tempo. PRD 6.7 menyebut daftar tindakan untuk
 * pemilik; tiga hal ini yang paling sering butuh keputusan cepat.
 */

export default function PurchasingOverviewPage() {
  const app = useApp()
  const canSeeDebt = can(app.role, 'reports.debt')

  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null)
  const [debts, setDebts] = useState<SupplierDebt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<SubscriptionResponse['subscription']['plan'] | null>(null)

  useEffect(() => {
    void apiGet<{ orders: PurchaseOrder[] }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders?limit=100`,
    ).then((result) => {
      if (result.ok) {
        setOrders(result.data.orders)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Data pembelian tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    void apiGet<SubscriptionResponse>(`/api/workspaces/${app.workspaceId}/subscription`).then((result) => {
      if (!result.ok) return
      setPlan(result.data.subscription.plan)
      if (result.data.subscription.plan !== 'gratis' && canSeeDebt) {
        void apiGet<{ debts: SupplierDebt[] }>(`/api/workspaces/${app.workspaceId}/supplier-debts`).then(
          (debtsResult) => { if (debtsResult.ok) setDebts(debtsResult.data.debts) },
        )
      }
    })
  }, [app.workspaceId])

  const menunggu = (orders ?? []).filter((item) => item.status === 'diajukan')
  const berjalan = (orders ?? []).filter((item) => item.status === 'diterima_sebagian')
  const lewatTempo = debts.filter((item) => (item.overdueDays ?? 0) > 0)
  const totalUtang = debts.reduce((jumlah, item) => jumlah + item.outstanding, 0)

  return (
    <PurchasingShell activeHref="/pembelian" title="Pembelian">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <div className={styles.actions}>
        <span
          className={`${styles.badge} ${
            menunggu.length > 0 ? styles.badgePending : styles.badgeNeutral
          }`}
        >
          Menunggu persetujuan {menunggu.length}
        </span>
        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
          Diterima sebagian {berjalan.length}
        </span>
        {canSeeDebt && plan !== 'gratis' ? <>
        <span
          className={`${styles.badge} ${
            lewatTempo.length > 0 ? styles.badgeDanger : styles.badgeNeutral
          }`}
        >
          Utang jatuh tempo {lewatTempo.length}
        </span>
        <span className={`${styles.badge} ${totalUtang > 0 ? styles.badgePending : styles.badgeOk}`}>
          Total utang {rupiah(totalUtang)}
        </span>
        </> : plan === 'gratis' ? <a className={styles.paginationLink} href="/pengaturan/paket">Utang supplier tersedia di paket Usaha · Lihat paket</a> : null}
      </div>

      {loading ? (
        <p role="status">Memuat ringkasan pembelian.</p>
      ) : orders && orders.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada pembelian</p>
          <p className={styles.stateBody}>
            Mulai dari membuat supplier, lalu buat purchase order. Barang baru masuk ke stok
            setelah penerimaannya dicatat.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.paginationLink} href="/pembelian/supplier">
              Tambah supplier
            </a>
            <a className={styles.paginationLink} href="/pembelian/po/baru">
              Buat PO
            </a>
          </div>
        </div>
      ) : null}

      {!loading && menunggu.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Menunggu persetujuan</h2>
          <ul className={styles.list}>
            {menunggu.map((order) => (
              <li key={order.id}>
                <a className={styles.card} href={`/pembelian/po/${order.id}`}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{order.number}</span>
                    <span className={styles.cardMeta}>{rupiah(order.totalAmount)}</span>
                  </span>
                  <span className={styles.cardMeta}>
                    {order.supplierName} · dibuat {order.createdByName}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!loading && berjalan.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Penerimaan sebagian</h2>
          <ul className={styles.list}>
            {berjalan.map((order) => (
              <li key={order.id}>
                <a className={styles.card} href={`/pembelian/po/${order.id}`}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{order.number}</span>
                    <span className={styles.cardMeta}>
                      {formatQty(order.receivedTotal)} sudah diterima
                    </span>
                  </span>
                  <span className={styles.cardMeta}>
                    {order.supplierName} · masih kurang {formatQty(belumDiterima(order))}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </PurchasingShell>
  )
}

/**
 * Sisa yang belum diterima. Jumlah barang dan rupiah dijumlahkan terpisah, jadi
 * perbandingannya selalu antara dua angka yang maknanya sama: jumlah barang.
 */
function belumDiterima(order: PurchaseOrder): number {
  return Math.max(0, order.orderedTotal - order.receivedTotal)
}
