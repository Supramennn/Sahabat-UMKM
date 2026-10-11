'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../../../components/app-context'
import { Alert, ErrorState } from '../../../../components/ui'
import {
  apiGet,
  apiPatch,
  errorMessage,
  type ProductsResponse,
  type ProductSummary,
  type PurchaseOrderDetail,
} from '../../../../../lib/api'
import { PurchasingShell } from '../../../pembelian-shell'
import { rupiah } from '../../../bagian'
import styles from '../../../pembelian.module.css'

/**
 * Revisi PO (PRD 6.3). PO yang sudah diajukan atau disetujui tidak bisa diubah
 * langsung; halaman ini membuat perubahan sebagai revisi bernomor dengan catatan
 * alasan yang wajib, dan mengembalikan PO yang disetujui ke status Diajukan supaya
 * isinya disetujui ulang.
 *
 * Supplier dan lokasi tujuan salah satu tidak ditampilkan sebagai isian karena
 * keduanya mengikat PO ke pihak dan gudang tertentu; menggantinya harus lewat PO
 * baru.
 */

interface BarisPO {
  productId: string
  quantity: string
  unitPrice: string
  discountAmount: string
}

export default function RevisePurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const app = useApp()
  const router = useRouter()

  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [baris, setBaris] = useState<BarisPO[]>([])
  const [expectedOn, setExpectedOn] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void params.then(({ id }) => setOrderId(id))
  }, [params])

  useEffect(() => {
    if (orderId === '') return
    void (async () => {
      const [hasil, daftarProduk] = await Promise.all([
        apiGet<PurchaseOrderDetail>(
          `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}`,
        ),
        apiGet<ProductsResponse>(
          `/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`,
        ),
      ])

      if (daftarProduk.ok) setProducts(daftarProduk.data.products)

      if (hasil.ok) {
        setDetail(hasil.data)
        setBaris(
          hasil.data.items.map((item) => ({
            productId: String(item.productId),
            quantity: item.quantity.toString(),
            unitPrice: String(item.unitPrice),
            discountAmount: item.discountAmount > 0 ? String(item.discountAmount) : '',
          })),
        )
        setExpectedOn(hasil.data.order.expectedOn ?? '')
        setNote(hasil.data.order.note ?? '')
      } else {
        setError(errorMessage(hasil.error, 'PO tidak bisa dimuat.'))
      }
      setLoading(false)
    })()
  }, [app.workspaceId, orderId])

  const status = detail?.order.status ?? ''
  const bisaDiubah = ['draft', 'diajukan', 'disetujui'].includes(status)
  const perluAlasan = status === 'diajukan' || status === 'disetujui'

  const total = baris.reduce(
    (jumlah, item) =>
      jumlah +
      rupiahToNumber(item.unitPrice) * rupiahToNumber(item.quantity) -
      rupiahToNumber(item.discountAmount),
    0,
  )

  function perbaruiBaris(index: number, perubahan: Partial<BarisPO>) {
    setBaris(baris.map((item, posisi) => (posisi === index ? { ...item, ...perubahan } : item)))
  }

  async function simpan() {
    const items = baris
      .filter((item) => item.productId !== '' && item.quantity !== '' && item.unitPrice !== '')
      .map((item) => ({
        productId: Number(item.productId),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount === '' ? null : item.discountAmount,
      }))

    if (items.length === 0) {
      setError('PO harus punya minimal satu barang dengan jumlah dan harga.')
      return
    }
    if (perluAlasan && reason.trim() === '') {
      setError('Isi catatan alasan revisi supaya perubahannya bisa ditelusuri.')
      return
    }

    setBusy(true)
    setError(null)

    const hasil = await apiPatch<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}`,
      {
        items,
        expectedOn: expectedOn === '' ? null : expectedOn,
        note: note || null,
        revisionReason: perluAlasan ? reason.trim() : null,
      },
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Perubahan PO tidak bisa disimpan.'))
      return
    }

    router.push(`/pembelian/po/${orderId}`)
  }

  return (
    <PurchasingShell activeHref="/pembelian/po" title="Revisi PO">
      {loading ? <p role="status">Memuat PO.</p> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}

      {!loading && detail && !bisaDiubah ? (
        <ErrorState
          title="PO tidak bisa direvisi"
          body={`PO berstatus ${detail.order.statusLabel} tidak bisa diubah lagi. Buat PO baru bila perlu memesan ulang.`}
        />
      ) : null}

      {detail && bisaDiubah ? (
        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <p className={styles.cardMeta}>
            {detail.order.number} · {detail.order.supplierName} · {detail.order.locationName}
          </p>

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="perkiraan">
              Perkiraan barang datang
            </label>
            <input
              className={styles.input}
              id="perkiraan"
              type="date"
              value={expectedOn}
              onChange={(event) => setExpectedOn(event.target.value)}
            />
          </div>

          {baris.map((item, index) => (
            <div key={index} className={styles.itemRow}>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor={`barang-${index}`}>
                  Barang
                </label>
                <select
                  className={styles.select}
                  id={`barang-${index}`}
                  value={item.productId}
                  onChange={(event) => perbaruiBaris(index, { productId: event.target.value })}
                >
                  <option value="">Pilih barang</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor={`jumlah-${index}`}>
                  Jumlah
                </label>
                <input
                  className={styles.input}
                  id={`jumlah-${index}`}
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(event) => perbaruiBaris(index, { quantity: event.target.value })}
                />
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor={`harga-${index}`}>
                  Harga beli per satuan
                </label>
                <input
                  className={styles.input}
                  id={`harga-${index}`}
                  inputMode="numeric"
                  value={item.unitPrice}
                  onChange={(event) => perbaruiBaris(index, { unitPrice: event.target.value })}
                />
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor={`diskon-${index}`}>
                  Diskon per baris (opsional)
                </label>
                <input
                  className={styles.input}
                  id={`diskon-${index}`}
                  inputMode="numeric"
                  value={item.discountAmount}
                  onChange={(event) => perbaruiBaris(index, { discountAmount: event.target.value })}
                />
              </div>
            </div>
          ))}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() =>
                setBaris([...baris, { productId: '', quantity: '1', unitPrice: '', discountAmount: '' }])
              }
            >
              Tambah barang
            </button>
            {baris.length > 1 ? (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => setBaris(baris.slice(0, -1))}
              >
                Hapus baris terakhir
              </button>
            ) : null}
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="catatan">
              Catatan
            </label>
            <input
              className={styles.input}
              id="catatan"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Kondisi pengiriman atau nomor WhatsApp supplier"
            />
          </div>

          {perluAlasan ? (
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="alasan">
                Catatan alasan revisi
              </label>
              <input
                className={styles.input}
                id="alasan"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: jumlah diperbarui setelah konfirmasi supplier"
                required
              />
            </div>
          ) : null}

          <p className={styles.cardMeta}>Total Sementara: {rupiah(total)}</p>

          {perluAlasan ? (
            <p className={styles.cardMeta}>
              PO yang disetujui akan kembali berstatus Diajukan setelah direvisi dan perlu
              disetujui ulang.
            </p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.submit} disabled={busy} onClick={() => void simpan()}>
              {busy ? 'Menyimpan' : 'Simpan revisi'}
            </button>
            <a className={styles.linkButton} href={`/pembelian/po/${orderId}`}>
              Batal
            </a>
          </div>
        </form>
      ) : null}
    </PurchasingShell>
  )
}

function rupiahToNumber(text: string): number {
  const bersih = text.trim().replace(/\./g, '').replace(',', '.')
  if (bersih === '') return 0
  const nilai = Number(bersih)
  return Number.isFinite(nilai) ? nilai : 0
}
