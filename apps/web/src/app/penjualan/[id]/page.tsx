'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/components/app-context'
import { Alert, ErrorState } from '@/components/ui'
import { apiGet, apiPost, errorMessage, type SaleDetail } from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import { badgeFor, rupiah, statusLabel } from '../bagian'
import styles from '../penjualan.module.css'

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = useApp()

  const [saleId, setSaleId] = useState('')
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void params.then(({ id }) => setSaleId(id))
  }, [params])

  const load = useCallback(async () => {
    if (saleId === '') return
    const hasil = await apiGet<SaleDetail>(`/api/workspaces/${app.workspaceId}/sales/${saleId}`)
    if (hasil.ok) {
      setDetail(hasil.data)
      setError(null)
    } else {
      setError(errorMessage(hasil.error, 'Penjualan tidak bisa dimuat.'))
    }
    setLoading(false)
  }, [app.workspaceId, saleId])

  useEffect(() => {
    void load()
  }, [load])

  async function batalkan() {
    if (!detail) return
    const alasan = window.prompt('Alasan pembatalan (minimal 5 karakter):')
    if (!alasan || alasan.trim().length < 5) {
      setError('Alasan pembatalan minimal 5 karakter.')
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/sales/${saleId}/cancel`,
      { reason: alasan.trim() },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Pembatalan gagal.'))
      return
    }

    setMessage('Penjualan dibatalkan. Stok sudah dikembalikan.')
    await load()
  }

  const status = detail?.sale.isCancelled ? 'cancelled' : 'active'

  return (
    <SalesShell activeHref="/penjualan/daftar" title={detail?.sale.number ?? 'Penjualan'}>
      {loading ? <p role="status">Memuat detail penjualan.</p> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {!loading && !detail && !error ? (
        <ErrorState title="Penjualan tidak ditemukan" body="Cek kembali tautan ini." />
      ) : null}

      {detail ? (
        <>
          <p className={styles.cardMeta}>
            <span className={badgeFor(status)}>{statusLabel(status)}</span> ·{' '}
            {detail.sale.customerName ?? 'Pelanggan umum'} · {detail.sale.locationName} · {detail.sale.soldOn}
          </p>

          <div className={styles.actions}>
            {!detail.sale.isCancelled ? (
              <button
                type="button"
                className={styles.linkButton}
                disabled={busy}
                onClick={() => void batalkan()}
              >
                Batalkan penjualan
              </button>
            ) : (
              <span className={styles.cardMeta}>Penjualan sudah dibatalkan pada {detail.sale.cancelledAt}</span>
            )}
          </div>

          <h2 className={styles.cardName}>Barang</h2>
          <ul className={styles.list}>
            {detail.items.map((item) => (
              <li key={item.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{item.productName}</span>
                  <span className={styles.cardMeta}>{rupiah(item.lineTotal)}</span>
                </span>
                <span className={styles.cardMeta}>
                  {item.quantity} {item.unitCode} × {rupiah(item.unitPrice)}
                  {item.discountAmount > 0 ? `, diskon ${rupiah(item.discountAmount)}` : ''}
                </span>
                <span className={styles.cardMeta}>
                  Harga pokok {rupiah(item.lineCogs)} · Laba kotor {rupiah(item.lineGrossProfit)}
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.summary}>
            <p>Total penjualan: <strong>{rupiah(detail.sale.totalAmount)}</strong></p>
            <p>Total HPP: <strong>{rupiah(detail.sale.totalCogs)}</strong></p>
            <p>Laba kotor: <strong>{rupiah(detail.sale.grossProfit)}</strong></p>
            <p>Metode bayar: {detail.sale.paymentMethod}</p>
            {detail.sale.note && <p>Catatan: {detail.sale.note}</p>}
          </div>
        </>
      ) : null}
    </SalesShell>
  )
}