'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../../components/app-context'
import { Alert, ErrorState } from '../../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type PurchaseOrderDetail,
} from '../../../../lib/api'
import { PurchasingShell } from '../../pembelian-shell'
import { badgeFor, rupiah } from '../../bagian'
import styles from '../../pembelian.module.css'

/**
 * Detail satu PO (PRD 6.3). Halaman ini adalah tempat semua alur status terlihat:
 * diajukan, disetujui atau ditolak, dibatalkan, ditutup, dan dicatatnya
 * penerimaan bertahap.
 *
 * Setiap aksi yang mengubah status menjelaskan akibatnya di dalam dialog konfirmasi
 * yang menyebut objeknya, karena PO yang sudah disetujui tidak bisa dibatalkan tanpa
 * meninggalkan jejak (PRD 10).
 */

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = useApp()

  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void params.then(({ id }) => setOrderId(id))
  }, [params])

  const load = useCallback(async () => {
    if (orderId === '') return
    const result = await apiGet<PurchaseOrderDetail>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}`,
    )
    if (result.ok) {
      setDetail(result.data)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'PO tidak bisa dimuat.'))
    }
    setLoading(false)
  }, [app.workspaceId, orderId])

  useEffect(() => {
    void load()
  }, [load])

  async function aksi(path: string, successMessage: string, konfirmasi?: string) {
    if (konfirmasi && !window.confirm(konfirmasi)) {
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}/${path}`,
      {},
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Tindakan itu tidak bisa dijalankan.'))
      return
    }

    setMessage(successMessage)
    await load()
  }

  async function catatPenerimaan() {
    const belum = detail?.items.filter((item) => item.outstanding > 0) ?? []
    if (belum.length === 0) {
      setError('Tidak ada barang yang masih menunggu diterima.')
      return
    }

    const jawaban = window.prompt(
      `Berapa jumlah diterima untuk ${belum[0]!.productName}?\nSisa di PO: ${belum[0]!.outstanding} ${belum[0]!.unitCode}.`,
      String(belum[0]!.outstanding),
    )
    if (jawaban === null) return

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ number: string }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
      {
        purchaseOrderId: orderId,
        items: [{ productId: belum[0]!.productId, quantity: jawaban }],
        idempotencyKey: `terima-${orderId}-${Date.now().toString(36)}`,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Penerimaan tidak bisa dicatat.'))
      return
    }

    setMessage(`Penerimaan ${result.data.number} tersimpan dan stok sudah bertambah.`)
    await load()
  }

  const status = detail?.order.status ?? 'draft'

  return (
    <PurchasingShell activeHref="/pembelian/po" title={detail?.order.number ?? 'Purchase order'}>
      {loading ? <p role="status">Memuat detail PO.</p> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {!loading && !detail && !error ? (
        <ErrorState title="PO tidak ditemukan" body="Cek kembali tautan PO ini." />
      ) : null}

      {detail ? (
        <>
          <p className={styles.cardMeta}>
            <span className={badgeFor(status)}>{detail.order.statusLabel}</span> ·{' '}
            {detail.order.supplierName} · {detail.order.locationName} ·{' '}
            {detail.order.orderedOn}
          </p>

          <div className={styles.actions}>
            {status === 'draft' ? (
              <button
                type="button"
                className={styles.submit}
                disabled={busy}
                onClick={() => void aksi('submit', 'PO diajukan untuk persetujuan.')}
              >
                Ajukan untuk persetujuan
              </button>
            ) : null}

            {status === 'diajukan' ? (
              <>
                <button
                  type="button"
                  className={styles.submit}
                  disabled={busy}
                  onClick={() =>
                    void aksi(
                      'approve',
                      'PO disetujui.',
                      `Setujui PO ${detail.order.number} untuk ${detail.order.supplierName}?`,
                    )
                  }
                >
                  Setujui
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={busy}
                  onClick={() =>
                    void aksi(
                      'reject',
                      'PO ditolak.',
                      `Tolak PO ${detail.order.number}? Supplier perlu diberi tahu alasannya.`,
                    )
                  }
                >
                  Tolak
                </button>
              </>
            ) : null}

            {['disetujui', 'diterima_sebagian'].includes(status) ? (
              <button
                type="button"
                className={styles.submit}
                disabled={busy}
                onClick={() => void catatPenerimaan()}
              >
                Catat penerimaan
              </button>
            ) : null}

            {['diterima', 'diterima_sebagian'].includes(status) ? (
              <button
                type="button"
                className={styles.linkButton}
                disabled={busy}
                onClick={() =>
                  void aksi(
                    'close',
                    'PO ditutup.',
                    `Tutup PO ${detail.order.number}? Barang yang belum datang tidak bisa dicatat setelah ini.`,
                  )
                }
              >
                Tutup PO
              </button>
            ) : null}

            {['draft', 'diajukan'].includes(status) ? (
              <button
                type="button"
                className={styles.linkButton}
                disabled={busy}
                onClick={() =>
                  void aksi(
                    'cancel',
                    'PO dibatalkan.',
                    `Batalkan PO ${detail.order.number}? Tindakan ini tercatat di jejak audit.`,
                  )
                }
              >
                Batalkan PO
              </button>
            ) : null}
          </div>

          <h2 className={styles.cardName}>Barang</h2>
          <ul className={styles.list}>
            {detail.items.map((item) => (
              <li key={item.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{item.productName}</span>
                  <span className={styles.cardMeta}>
                    {rupiah(item.lineTotal)}
                  </span>
                </span>
                <span className={styles.cardMeta}>
                  {item.quantity} {item.unitCode} × {rupiah(item.unitPrice)}
                  {item.discountAmount > 0 ? `, diskon ${rupiah(item.discountAmount)}` : ''}
                </span>
                <span className={styles.cardMeta}>
                  Diterima {item.receivedQuantity} {item.unitCode} · sisa {item.outstanding}{' '}
                  {item.unitCode}
                </span>
              </li>
            ))}
          </ul>

          <p className={styles.cardMeta}>Total PO: {rupiah(detail.order.totalAmount)}</p>

          {detail.receipts.length > 0 ? (
            <>
              <h2 className={styles.cardName}>Penerimaan</h2>
              <ul className={styles.list}>
                {detail.receipts.map((receipt) => (
                  <li key={receipt.receiptId} className={styles.card}>
                    <span className={styles.cardName}>{receipt.number}</span>
                    <span className={styles.cardMeta}>
                      {receipt.receivedOn} · dicatat {receipt.receivedByName}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {detail.revisions.length > 0 ? (
            <>
              <h2 className={styles.cardName}>Riwayat revisi</h2>
              <ul className={styles.list}>
                {detail.revisions.map((revision) => (
                  <li key={revision.revisionNumber} className={styles.card}>
                    <span className={styles.cardName}>Revisi {revision.revisionNumber}</span>
                    <span className={styles.cardMeta}>
                      {revision.reason} · diubah {revision.changedByName}
                    </span>                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </PurchasingShell>
  )
}
