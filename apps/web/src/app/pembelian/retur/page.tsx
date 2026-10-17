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

const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const GROUP = 'flex min-w-0 flex-[1_1_12rem] flex-col gap-1'
const LABEL = 'text-[0.9375rem] font-medium text-text-primary'
const INPUT = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary'

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

      <p className="text-sm text-text-secondary">
        Retur mengurangi stok di lokasi yang dipilih dan mengurangi utang supplier sebesar
        harga di PO. Kalau stok di lokasi tidak cukup, retur ditolak dan saldo tidak berubah.
      </p>

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat data retur.
        </p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada barang yang bisa diretur</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Retur hanya bisa dilakukan untuk purchase order yang sudah menerima barang. Catat
            penerimaan dulu, lalu barangnya bisa diretur di halaman ini.
          </p>
        </div>
      ) : null}

      {!loading && orders.length > 0 ? (
        <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit}>
          <div className={GROUP}>
            <label className={LABEL} htmlFor="po-retur">
              Purchase order asal
            </label>
            <select
              className={INPUT}
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
              <div className={GROUP}>
                <label className={LABEL} htmlFor="lokasi-retur">
                  Lokasi barang yang diretur
                </label>
                <select
                  className={INPUT}
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
                <p className="text-sm text-text-secondary">
                  Retur mengurangi stok di lokasi ini. Kalau barang disimpan di tempat lain,
                  pilih lokasi tempat barangnya benar-benar ada.
                </p>
              </div>

              <h2 className="text-lg font-semibold">Barang yang bisa diretur</h2>
              <ul className="flex flex-col gap-2">
                {detail.items.map((item) => (
                  <li key={item.id} className={CARD}>
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-primary">{item.productName}</span>
                      <span className="text-sm text-text-secondary tabular">{rupiah(item.unitPrice)}</span>
                    </span>
                    <span className="text-sm text-text-secondary tabular">
                      Diterima {formatQty(item.receivedQuantity)} {item.unitCode}
                    </span>
                    <div className={GROUP}>
                      <label className={LABEL} htmlFor={`retur-${item.productId}`}>
                        Jumlah diretur
                      </label>
                      <input
                        className={INPUT}
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

          <div className={GROUP}>
            <label className={LABEL} htmlFor="catatan-retur">
              Alasan retur
            </label>
            <input
              className={INPUT}
              id="catatan-retur"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Contoh: kemasan rusak, barang tidak sesuai pesanan"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 self-start rounded-control border border-transparent bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
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