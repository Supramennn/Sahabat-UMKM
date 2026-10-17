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
import { cx } from '../../../lib/cx'
import { PurchasingShell } from '../pembelian-shell'
import { rupiah } from '../bagian'

/**
 * PRD 5: Pembelian > Penerimaan. Daftar penerimaan dan pencatatan penerimaan baru
 * untuk PO yang sudah disetujui.
 *
 * Penerimaan hanya bisa untuk PO berstatus Disetujui atau Diterima Sebagian,
 * karena barang yang tidak pernah dipesan tidak boleh masuk lewat jalur ini.
 */

const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'

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
        <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
            <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="po-terima">
              PO yang diterima
            </label>
            <select
              className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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
          <button
            type="submit"
            className="min-h-touch cursor-pointer self-start rounded-control bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
            disabled={busy || orderId === ''}
          >
            {busy ? 'Menyimpan' : 'Catat penerimaan'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar penerimaan.
        </p>
      ) : receipts && receipts.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada penerimaan</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Barang baru menambah stok setelah penerimaan dicatat, jadi mencatatnya saat barang
            datang adalah langkah yang paling menentukan saldo.
          </p>
        </div>
      ) : null}

      {!loading && receipts && receipts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <li key={receipt.receiptId} className={CARD}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-primary tabular">{receipt.number}</span>
                {receipt.orderNumber ? (
                  <span className={cx(BADGE, 'border-border-strong text-text-secondary')}>
                    {receipt.orderNumber}
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-text-secondary tabular">
                {receipt.supplierName} · {receipt.locationName} · {receipt.receivedOn}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-sm text-text-secondary">
        Retur pembelian dan pembayaran supplier dicatat di halaman masing-masing.
      </p>
    </PurchasingShell>
  )
}
