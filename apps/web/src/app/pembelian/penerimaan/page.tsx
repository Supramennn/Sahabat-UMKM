'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type GoodsReceipt,
  type PurchaseOrder,
  type PurchaseOrderDetail,
} from '../../../lib/api'
import { PurchasingShell } from '../pembelian-shell'
import { formatQty, kunciIdempotensi, parseJumlah, rupiah } from '../bagian'
import styles from '../pembelian.module.css'

/**
 * PRD 6.3: Pembelian > Penerimaan. Mencatat penerimaan barang untuk PO yang sudah
 * disetujui, dengan jumlah per barang sehingga pengiriman bertahap dan pengiriman
 * yang datang sebagian tetap tercatat apa adanya.
 *
 * Stok hanya bertambah sebesar jumlah yang benar-benar diterima. PO yang barangnya
 * belum datang seluruhnya muncul lagi di daftar sampai sisanya nol.
 */

export default function GoodsReceiptsPage() {
  const app = useApp()

  const [receipts, setReceipts] = useState<GoodsReceipt[] | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [jumlah, setJumlah] = useState<Record<number, string>>({})
  const [note, setNote] = useState('')
  const [kunci, setKunci] = useState(() => kunciIdempotensi('terima'))
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const muatDaftar = useCallback(async () => {
    const [daftar, penerimaan] = await Promise.all([
      Promise.all([
        apiGet<{ orders: PurchaseOrder[] }>(
          `/api/workspaces/${app.workspaceId}/purchase-orders?limit=100&status=disetujui`,
        ),
        apiGet<{ orders: PurchaseOrder[] }>(
          `/api/workspaces/${app.workspaceId}/purchase-orders?limit=100&status=diterima_sebagian`,
        ),
      ]),
      apiGet<{ receipts: GoodsReceipt[] }>(
        `/api/workspaces/${app.workspaceId}/goods-receipts`,
      ),
    ])

    const [disetujui, sebagian] = daftar
    if (disetujui.ok && sebagian.ok) {
      setOrders([...disetujui.data.orders, ...sebagian.data.orders])
    }

    if (penerimaan.ok) {
      setReceipts(penerimaan.data.receipts)
      setError(null)
    } else {
      setError(errorMessage(penerimaan.error, 'Daftar penerimaan tidak bisa dimuat.'))
    }
    setLoading(false)
  }, [app.workspaceId])

  useEffect(() => {
    void muatDaftar()
  }, [muatDaftar])

  const muatDetail = useCallback(
    async (id: string) => {
      if (id === '') {
        setDetail(null)
        return
      }
      setLoadingDetail(true)
      const hasil = await apiGet<PurchaseOrderDetail>(
        `/api/workspaces/${app.workspaceId}/purchase-orders/${id}`,
      )
      setLoadingDetail(false)

      if (!hasil.ok) {
        setDetail(null)
        setError(errorMessage(hasil.error, 'Rincian PO tidak bisa dimuat.'))
        return
      }

      setDetail(hasil.data)
      setJumlah(
        Object.fromEntries(
          hasil.data.items
            .filter((item) => item.outstanding > 0)
            .map((item) => [item.id, String(item.outstanding)]),
        ),
      )
      setKunci(kunciIdempotensi('terima'))
    },
    [app.workspaceId],
  )

  useEffect(() => {
    setSuccess(null)
    void muatDetail(orderId)
  }, [orderId, muatDetail])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!detail) {
      setError('Pilih PO yang barangnya sedang datang.')
      return
    }

    const items: Array<{ productId: number; quantity: number }> = []
    for (const item of detail.items) {
      if (item.outstanding <= 0) continue
      const nilai = parseJumlah(jumlah[item.id] ?? '')
      if (nilai === null) continue
      if (nilai > item.outstanding) {
        setError(
          `Jumlah ${item.productName} melebihi sisa PO (${formatQty(item.outstanding)} ${item.unitCode}).`,
        )
        return
      }
      items.push({ productId: item.productId, quantity: nilai })
    }

    if (items.length === 0) {
      setError('Isi jumlah yang benar-benar diterima untuk minimal satu barang.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    const hasil = await apiPost<{ number: string }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
      {
        purchaseOrderId: detail.order.id,
        note: note || null,
        items,
        idempotencyKey: kunci,
      },
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penerimaan tidak bisa dicatat.'))
      return
    }

    setSuccess(`Penerimaan ${hasil.data.number} tersimpan dan stok sudah bertambah.`)
    setNote('')
    await muatDaftar()
    await muatDetail(orderId)
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

          {loadingDetail ? <p role="status">Memuat rincian PO.</p> : null}

          {detail
            ? detail.items
                .filter((item) => item.outstanding > 0)
                .map((item) => (
                  <div key={item.id} className={styles.itemRow}>
                    <span className={styles.cardName}>{item.productName}</span>
                    <span className={styles.cardMeta}>
                      Sisa {formatQty(item.outstanding)} {item.unitCode}
                    </span>
                    <div className={styles.filterGroup}>
                      <label className={styles.label} htmlFor={`terima-${item.id}`}>
                        Jumlah diterima ({item.unitCode})
                      </label>
                      <input
                        className={styles.input}
                        id={`terima-${item.id}`}
                        inputMode="decimal"
                        value={jumlah[item.id] ?? ''}
                        onChange={(event) =>
                          setJumlah({ ...jumlah, [item.id]: event.target.value })
                        }
                      />
                    </div>
                  </div>
                ))
            : null}

          {detail ? (
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="catatan-terima">
                Catatan (opsional)
              </label>
              <input
                className={styles.input}
                id="catatan-terima"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Nomor surat jalan atau kondisi barang"
              />
            </div>
          ) : null}

          <button type="submit" className={styles.submit} disabled={busy || !detail}>
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
