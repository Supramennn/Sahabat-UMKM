'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../components/app-context'
import { Alert } from '../components/ui'
import { apiGet, errorMessage, type PurchaseOrder, type SupplierDebt, type SubscriptionResponse } from '../../lib/api'
import { cx } from '../../lib/cx'
import { PurchasingShell } from './pembelian-shell'
import { formatQty, rupiah } from './bagian'
import { can } from '@sahabat/shared'

/**
 * Pembelian dalam satu layar: PO yang menunggu keputusan, PO yang sedang berjalan,
 * dan utang yang sudah lewat jatuh tempo. PRD 6.7 menyebut daftar tindakan untuk
 * pemilik; tiga hal ini yang paling sering butuh keputusan cepat.
 */

const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'
const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const LINK_BUTTON = 'inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary'

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

      <div className="flex flex-wrap gap-2">
        <span
          className={cx(
            BADGE,
            menunggu.length > 0 ? 'border-warning text-warning' : 'border-border-strong text-text-secondary',
          )}
        >
          Menunggu persetujuan {menunggu.length}
        </span>
        <span className={cx(BADGE, 'border-border-strong text-text-secondary')}>
          Diterima sebagian {berjalan.length}
        </span>
        {canSeeDebt && plan !== 'gratis' ? <>
        <span
          className={cx(
            BADGE,
            lewatTempo.length > 0 ? 'border-danger text-danger' : 'border-border-strong text-text-secondary',
          )}
        >
          Utang jatuh tempo {lewatTempo.length}
        </span>
        <span className={cx(BADGE, totalUtang > 0 ? 'border-warning text-warning' : 'border-success text-success')}>
          Total utang {rupiah(totalUtang)}
        </span>
        </> : plan === 'gratis' ? <a className={LINK_BUTTON} href="/pengaturan/paket">Utang supplier tersedia di paket Usaha · Lihat paket</a> : null}
      </div>

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat ringkasan pembelian.
        </p>
      ) : orders && orders.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada pembelian</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Mulai dari membuat supplier, lalu buat purchase order. Barang baru masuk ke stok
            setelah penerimaannya dicatat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={LINK_BUTTON} href="/pembelian/supplier">
              Tambah supplier
            </a>
            <a className={LINK_BUTTON} href="/pembelian/po/baru">
              Buat PO
            </a>
          </div>
        </div>
      ) : null}

      {!loading && menunggu.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold">Menunggu persetujuan</h2>
          <ul className="flex flex-col gap-2">
            {menunggu.map((order) => (
              <li key={order.id}>
                <a className={CARD} href={`/pembelian/po/${order.id}`}>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-primary tabular">{order.number}</span>
                    <span className="text-sm text-text-secondary tabular">{rupiah(order.totalAmount)}</span>
                  </span>
                  <span className="text-sm text-text-secondary">
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
          <h2 className="text-lg font-semibold">Penerimaan sebagian</h2>
          <ul className="flex flex-col gap-2">
            {berjalan.map((order) => (
              <li key={order.id}>
                <a className={CARD} href={`/pembelian/po/${order.id}`}>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-primary tabular">{order.number}</span>
                    <span className="text-sm text-text-secondary tabular">
                      {formatQty(order.receivedTotal)} sudah diterima
                    </span>
                  </span>
                  <span className="text-sm text-text-secondary tabular">
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
