'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../../components/app-context'
import { AppShell } from '../../../components/shell'
import { ErrorState } from '../../../components/ui'
import { apiGet, errorMessage, type ProductSummary } from '../../../../lib/api'
import { formatQty } from '../../bagian'
import styles from '../../stok.module.css'

/**
 * Detail satu barang: saldo per lokasi dan tanggal kedaluwarsa paling awal dari
 * penerimaan yang masih bersaldo. Nilai ini ikut tampil pada laporan dengan label
 * yang jelas, karena 1.0 tidak mengalokasikan barang berdasarkan FEFO (A-05).
 */

interface ProductDetailResponse {
  product: ProductSummary
  balances: Array<{
    locationId: number
    locationName: string
    quantity: number
    earliestExpiry: string | null
  }>
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = useApp()

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const { id } = await params
      const result = await apiGet<ProductDetailResponse>(
        `/api/workspaces/${app.workspaceId}/products/${id}`,
      )
      if (berhenti) return

      if (result.ok) {
        setDetail(result.data)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Barang tidak bisa dimuat.'))
      }
      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [app.workspaceId, params])

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok"
      breadcrumb="Stok"
      title={detail?.product.name ?? 'Barang'}
    >
      {loading ? <p role="status">Memuat detail barang.</p> : null}

      {error ? <ErrorState title="Barang tidak ditemukan" body={error} /> : null}

      {detail ? (
        <>
          <p className={styles.cardMeta}>
            {detail.product.sku}
            {detail.product.categoryName ? ` · ${detail.product.categoryName}` : ''} · Status{' '}
            {detail.product.status}
          </p>

          <h2 className={styles.cardName}>Saldo per lokasi</h2>
          {detail.balances.length === 0 ? (
            <p className={styles.cardMeta}>
              Barang ini belum punya saldo. Catat stok masuk untuk menambahkannya.
            </p>
          ) : (
            <ul className={styles.list}>
              {detail.balances.map((balance) => (
                <li key={balance.locationId} className={styles.card}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{balance.locationName}</span>
                    <span className={styles.quantity}>
                      {formatQty(balance.quantity)} {detail.product.unitCode}
                    </span>
                  </span>
                  <span className={styles.cardMeta}>
                    {balance.earliestExpiry
                      ? `Kedaluwarsa pertama ${balance.earliestExpiry}`
                      : 'Tanpa tanggal kedaluwarsa'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className={styles.cardName}>Harga</h2>
          <ul className={styles.list}>
            <li className={styles.card}>
              <span className={styles.cardMeta}>Harga pokok rata-rata bergerak</span>
              <span className={styles.quantity}>
                {formatQty(detail.product.averageCost)} per {detail.product.unitCode}
              </span>
            </li>
          </ul>
        </>
      ) : null}
    </AppShell>
  )
}
