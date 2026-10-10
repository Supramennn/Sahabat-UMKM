'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type LocationsResponse,
  type PurchaseOrder,
  type PurchaseOrderDetail,
} from '../../../lib/api'
import { PurchasingShell } from '../pembelian-shell'
import { formatQty, rupiah } from '../bagian'
import styles from '../pembelian.module.css'

/**
 * Retur pembelian (PRD 6.3: retur pembelian mengurangi stok dan mengurangi nilai
 * utang pada PO terkait).
 *
 * Dua aturan yang membuat halaman ini tidak bisa sederhana:
 *
 * 1. Retur selalu mengurangi stok, jadi ditolak kalau saldonya tidak cukup.
 *    Pesan penolakan datang dari server dan menyebut barang serta saldo yang ada,
 *    jadi halaman ini tidak menebaknya.
 * 2. Kalau retur dikaitkan ke PO, nilainya mengurangi utang sebesar harga di PO,
 *    bukan harga yang diketik ulang. Kalau salah ketik, utang supplier berubah
 *    tanpa jejak.
 */

export default function PurchaseReturnsPage() {
  const app = useApp()

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])

  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [note, setNote] = useState('')
  const [jumlah, setJumlah] = useState<Record<number, string>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Supplier diambil dari PO yang dipilih, jadi tidak ada daftar supplier sendiri
    // di sini: retur tanpa PO tidak bisa mengurangi utang pada PO tertentu.
    void apiGet<{ orders: PurchaseOrder[] }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders?limit=100`,
    ).then((result) => {
      if (result.ok) {
        // Hanya PO yang benar-benar menerima barang yang bisa diretur. Retur
        // barang yang belum datang bukan retur, itu pembatalan PO.
        const bisa = result.data.orders.filter((item) =>
          ['diterima_sebagian', 'diterima', 'ditutup'].includes(item.status),
        )
        setOrders(bisa)
      }
    })

    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) {
        const aktif = result.data.locations.filter((item) => !item.archived)
        setLocations(aktif)
        setLocationId(String(aktif.find((item) => item.isDefault)?.id ?? aktif[0]?.id ?? ''))
      }
    })

    setLoading(false)
  }, [app.workspaceId])

  // Memuat isi PO terpilih supaya barang yang bisa diretur dan sisa penerimaannya
  // terlihat, dan supaya harga tidak perlu diketik ulang.
  useEffect(() => {
    if (orderId === '') {
      setDetail(null)
      return
    }

    let batal = false
    void apiGet<PurchaseOrderDetail>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}`,
    ).then((result) => {
      if (batal) return
      if (result.ok) {
        setDetail(result.data)
        setSupplierId(String(result.data.order.supplierId))
        setLocationId(String(result.data.order.locationId))
      } else {
        setError(errorMessage(result.error, 'PO tidak bisa dimuat.'))
      }
    })

    return () => {
      batal = true
    }
  }, [app.workspaceId, orderId])

  const barangDiretur = (detail?.items ?? []).filter(
    (item) => item.receivedQuantity > 0 && (jumlah[item.productId] ?? '') !== '',
  )

  async function onSubmit(event: FormEvent) {
    event.preventDefault()

    if (barangDiretur.length === 0) {
      setError('Isi dulu jumlah barang yang mau diretur.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    const hasil = await apiPost<{ number: string }>(
      `/api/workspaces/${app.workspaceId}/purchase-returns`,
      {
        purchaseOrderId: orderId === '' ? null : Number(orderId),
        supplierId: Number(supplierId),
        locationId: Number(locationId),
        note: note || null,
        items: barangDiretur.map((item) => ({
          productId: item.productId,
          quantity: jumlah[item.productId] ?? '0',
        })),
        idempotencyKey: `retur-${orderId || 'bebas'}-${Date.now().toString(36)}`,
      },
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Retur tidak bisa dicatat.'))
      return
    }

    setSuccess(
      `Retur ${hasil.data.number} tersimpan. Stok dan utang supplier sudah berkurang.`,
    )
    setJumlah({})
    setNote('')
    if (detail) void reloadOrder(app.workspaceId, orderId, setDetail)
  }

  return (
    <PurchasingShell activeHref="/pembelian/retur" title="Retur pembelian">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      <p className={styles.cardMeta}>
        Retur mengurangi stok di lokasi yang dipilih dan mengurangi utang supplier sebesar
        harga di PO. Kalau stok di lokasi tidak cukup, retur ditolak dan saldo tidak berubah.
      </p>

      {loading ? (
        <p role="status">Memuat data retur.</p>
      ) : orders.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada barang yang bisa diretur</p>
          <p className={styles.stateBody}>
            Retur hanya bisa dilakukan untuk purchase order yang sudah menerima barang. Catat
            penerimaan dulu, lalu barangnya bisa diretur di halaman ini.
          </p>
        </div>
      ) : null}

      {!loading && orders.length > 0 ? (
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="po-retur">
              Purchase order asal
            </label>
            <select
              className={styles.select}
              id="po-retur"
              value={orderId}
              onChange={(event) => {
                setOrderId(event.target.value)
                setJumlah({})
              }}
            >
              <option value="">Pilih PO</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.number} · {order.supplierName} · {order.statusLabel}
                </option>
              ))}
            </select>
          </div>

          {detail ? (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="lokasi-retur">
                  Lokasi barang yang diretur
                </label>
                <select
                  className={styles.select}
                  id="lokasi-retur"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>
                  Retur mengurangi stok di lokasi ini. Kalau barang disimpan di tempat lain,
                  pilih lokasi tempat barangnya benar-benar ada.
                </p>
              </div>

              <h2 className={styles.cardName}>Barang yang bisa diretur</h2>
              <ul className={styles.list}>
                {detail.items.map((item) => (
                  <li key={item.id} className={styles.card}>
                    <span className={styles.cardRow}>
                      <span className={styles.cardName}>{item.productName}</span>
                      <span className={styles.cardMeta}>{rupiah(item.unitPrice)}</span>
                    </span>
                    <span className={styles.cardMeta}>
                      Diterima {formatQty(item.receivedQuantity)} {item.unitCode}
                    </span>
                    <div className={styles.filterGroup}>
                      <label className={styles.label} htmlFor={`retur-${item.productId}`}>
                        Jumlah diretur
                      </label>
                      <input
                        className={styles.input}
                        id={`retur-${item.productId}`}
                        inputMode="decimal"
                        value={jumlah[item.productId] ?? ''}
                        onChange={(event) =>
                          setJumlah({ ...jumlah, [item.productId]: event.target.value })
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="catatan-retur">
              Alasan retur
            </label>
            <input
              className={styles.input}
              id="catatan-retur"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Contoh: kemasan rusak, barang tidak sesuai pesanan"
            />
          </div>

          <button
            type="submit"
            className={styles.submit}
            disabled={busy || barangDiretur.length === 0 || locationId === '' || supplierId === ''}
          >
            {busy ? 'Menyimpan' : 'Catat retur'}
          </button>
        </form>
      ) : null}
    </PurchasingShell>
  )
}

async function reloadOrder(
  workspaceId: number,
  orderId: string,
  setDetail: (value: PurchaseOrderDetail) => void,
): Promise<void> {
  const result = await apiGet<PurchaseOrderDetail>(
    `/api/workspaces/${workspaceId}/purchase-orders/${orderId}`,
  )
  if (result.ok) setDetail(result.data)
}