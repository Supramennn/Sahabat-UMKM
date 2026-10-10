'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type GoodsReceipt,
  type PurchaseOrder,
} from '../../../lib/api'
import { PurchasingShell } from '../pembelian-shell'
import { rupiah } from '../bagian'
import styles from '../pembelian.module.css'

/**
 * PRD 5: Pembelian > Penerimaan. Daftar penerimaan dan pencatatan penerimaan baru
 * untuk PO yang sudah disetujui.
 *
 * Penerimaan hanya bisa untuk PO berstatus Disetujui atau Diterima Sebagian,
 * karena barang yang tidak pernah dipesan tidak boleh masuk lewat jalur ini.
 */

export default function GoodsReceiptsPage() {
  const app = useApp()

  const [receipts, setReceipts] = useState<GoodsReceipt[] | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void apiGet<{ orders: PurchaseOrder[] }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders?limit=100&status=disetujui`,
    ).then((result) => {
      if (result.ok) setOrders(result.data.orders)
    })

    void apiGet<{ receipts: GoodsReceipt[] }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
    ).then((result) => {
      if (result.ok) {
        setReceipts(result.data.receipts)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Daftar penerimaan tidak bisa dimuat.'))
      }
      setLoading(false)
    })
  }, [app.workspaceId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const order = orders.find((item) => String(item.id) === orderId)
    if (!order) {
      setError('Pilih PO yang barangnya sedang datang.')
      return
    }

    const jawaban = window.prompt(
      `Berapa total yang diterima dari ${order.supplierName}?\nJumlahnya boleh lebih kecil dari total PO kalau pengiriman bertahap.`,
      '',
    )
    if (jawaban === null || jawaban.trim() === '') return

    setBusy(true)
    setError(null)
    setSuccess(null)

    const hasil = await apiPost<{ number: string }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
      {
        purchaseOrderId: order.id,
        items: [{ productId: Number(order.id), quantity: jawaban }],
        idempotencyKey: `terima-${order.id}-${Date.now().toString(36)}`,
      },
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penerimaan tidak bisa dicatat.'))
      return
    }

    setSuccess(`Penerimaan ${hasil.data.number} tersimpan.`)
    const refresh = await apiGet<{ receipts: GoodsReceipt[] }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
    )
    if (refresh.ok) setReceipts(refresh.data.receipts)
  }

  return (
    <PurchasingShell activeHref="/pembelian/penerimaan" title="Penerimaan barang">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {orders.length > 0 ? (
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="po-terima">
              PO yang diterima
            </label>
            <select
              className={styles.select}
              id="po-terima"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Pilih PO</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.number} · {order.supplierName} · {rupiah(order.totalAmount)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={styles.submit} disabled={busy || orderId === ''}>
            {busy ? 'Menyimpan' : 'Catat penerimaan'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p role="status">Memuat daftar penerimaan.</p>
      ) : receipts && receipts.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada penerimaan</p>
          <p className={styles.stateBody}>
            Barang baru menambah stok setelah penerimaan dicatat, jadi mencatatnya saat barang
            datang adalah langkah yang paling menentukan saldo.
          </p>
        </div>
      ) : null}

      {!loading && receipts && receipts.length > 0 ? (
        <ul className={styles.list}>
          {receipts.map((receipt) => (
            <li key={receipt.receiptId} className={styles.card}>
              <span className={styles.cardRow}>
                <span className={styles.cardName}>{receipt.number}</span>
                {receipt.orderNumber ? (
                  <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                    {receipt.orderNumber}
                  </span>
                ) : null}
              </span>
              <span className={styles.cardMeta}>
                {receipt.supplierName} · {receipt.locationName} · {receipt.receivedOn}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.hint}>
        Retur pembelian dan pembayaran supplier dicatat di halaman masing-masing.
      </p>
    </PurchasingShell>
  )
}
