'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../../components/app-context'
import { Alert } from '../../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type LocationsResponse,
  type ProductSummary,
  type ProductsResponse,
  type SuppliersResponse,
} from '../../../../lib/api'
import { PurchasingShell } from '../../pembelian-shell'
import { parseUsulan, rupiah } from '../../bagian'

/**
 * Pembuatan PO (PRD 6.3). PO disimpan sebagai draft supaya bisa diperiksa dulu,
 * lalu diajukan untuk persetujuan. PO yang langsung diajukan tanpa diperiksa
 * adalah sumber paling sering kesalahan tidak terlihat.
 *
 * Jumlah usulan dari daftar stok rendah bisa diubah di sini, karena PRD 6.3
 * meminta usulan yang bisa diubah.
 */

const FORM = 'flex max-w-[34rem] flex-col gap-4'
const GROUP = 'flex min-w-0 flex-[1_1_12rem] flex-col gap-1'
const LABEL = 'text-[0.9375rem] font-medium text-text-primary'
const INPUT = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary'
const ACTIONS = 'flex flex-wrap gap-2'
const PRIMARY_BUTTON = 'min-h-touch cursor-pointer rounded-control bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'
const SECONDARY_BUTTON = 'min-h-touch cursor-pointer rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'

interface BarisPO {
  productId: string
  quantity: string
  unitPrice: string
  discountAmount: string
}

export default function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>
}) {
  const app = useApp()
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<SuppliersResponse['suppliers']>([])
  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [expectedOn, setExpectedOn] = useState('')
  const [note, setNote] = useState('')
  const [baris, setBaris] = useState<BarisPO[]>([barisKosong()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void apiGet<SuppliersResponse>(`/api/workspaces/${app.workspaceId}/suppliers`).then((result) => {
      if (result.ok) {
        setSuppliers(result.data.suppliers.filter((item) => !item.archived))
        setSupplierId((sebelumnya) => sebelumnya || String(result.data.suppliers[0]?.id ?? ''))
      }
    })
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) {
        const aktif = result.data.locations.filter((item) => !item.archived)
        setLocations(aktif)
        setLocationId(String(aktif.find((item) => item.isDefault)?.id ?? aktif[0]?.id ?? ''))
      }
    })
    void apiGet<ProductsResponse>(
      `/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`,
    ).then((result) => {
      if (result.ok) setProducts(result.data.products)
    })
  }, [app.workspaceId])

  // PRD 6.3: PO bisa dibuat langsung dari daftar stok rendah, dengan jumlah
  // usulan per barang yang tetap bisa diubah sebelum disimpan.
  //
  // Usulan dikirim sebagai segmen URL, bukan di state halaman peringatan, supaya
  // alamatnya bisa ditandai, dikirim ulang, dan dibuka lagi tanpa kehilangan isi.
  useEffect(() => {
    let batal = false

    void searchParams.then((params) => {
      if (batal || !params.items) return
      const usulan = parseUsulan(params.items)
      if (usulan.length > 0) {
        setBaris(usulan)
      }
    })

    return () => {
      batal = true
    }
  }, [searchParams])

  const total = baris.reduce(
    (jumlah, item) =>
      jumlah + rupiahToNumber(item.unitPrice) * rupiahToNumber(item.quantity) - rupiahToNumber(item.discountAmount),
    0,
  )

  function perbaruiBaris(index: number, perubahan: Partial<BarisPO>) {
    setBaris(baris.map((item, posisi) => (posisi === index ? { ...item, ...perubahan } : item)))
  }

  async function simpan(diajukan: boolean) {
    setBusy(true)
    setError(null)

    const items = baris
      .filter((item) => item.productId !== '' && item.quantity !== '' && item.unitPrice !== '')
      .map((item) => ({
        productId: Number(item.productId),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount === '' ? null : item.discountAmount,
      }))

    const hasil = await apiPost<{ orderId: number; number: string }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders`,
      {
        supplierId: Number(supplierId),
        locationId: Number(locationId),
        expectedOn: expectedOn === '' ? null : expectedOn,
        note: note || null,
        items,
      },
    )

    if (!hasil.ok) {
      setBusy(false)
      setError(errorMessage(hasil.error, 'PO tidak bisa disimpan.'))
      return
    }

    if (diajukan) {
      const diajukan = await apiPost<{ message: string }>(
        `/api/workspaces/${app.workspaceId}/purchase-orders/${hasil.data.orderId}/submit`,
        {},
      )
      if (!diajukan.ok) {
        setBusy(false)
        setError(
          `PO ${hasil.data.number} tersimpan sebagai draft, tapi pengajuannya gagal: ${errorMessage(diajukan.error)}`,
        )
        return
      }
    }

    setBusy(false)
    router.push(`/pembelian/po/${hasil.data.orderId}`)
  }

  return (
    <PurchasingShell activeHref="/pembelian/po" title="Buat purchase order">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <form className={FORM} onSubmit={(event) => event.preventDefault()}>
        <div className={GROUP}>
          <label className={LABEL} htmlFor="supplier">
            Supplier
          </label>
          <select
            className={INPUT}
            id="supplier"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="lokasi-tujuan">
            Lokasi tujuan
          </label>
          <select
            className={INPUT}
            id="lokasi-tujuan"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="perkiraan">
            Perkiraan barang datang
          </label>
          <input
            className={INPUT}
            id="perkiraan"
            type="date"
            value={expectedOn}
            onChange={(event) => setExpectedOn(event.target.value)}
          />
        </div>

        {baris.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <div className={GROUP}>
              <label className={LABEL} htmlFor={`barang-${index}`}>
                Barang
              </label>
              <select
                className={INPUT}
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

            <div className={GROUP}>
              <label className={LABEL} htmlFor={`jumlah-${index}`}>
                Jumlah
              </label>
              <input
                className={INPUT}
                id={`jumlah-${index}`}
                inputMode="decimal"
                value={item.quantity}
                onChange={(event) => perbaruiBaris(index, { quantity: event.target.value })}
              />
            </div>

            <div className={GROUP}>
              <label className={LABEL} htmlFor={`harga-${index}`}>
                Harga beli per satuan
              </label>
              <input
                className={INPUT}
                id={`harga-${index}`}
                inputMode="numeric"
                value={item.unitPrice}
                onChange={(event) => perbaruiBaris(index, { unitPrice: event.target.value })}
              />
            </div>

            <div className={GROUP}>
              <label className={LABEL} htmlFor={`diskon-${index}`}>
                Diskon per baris (opsional)
              </label>
              <input
                className={INPUT}
                id={`diskon-${index}`}
                inputMode="numeric"
                value={item.discountAmount}
                onChange={(event) => perbaruiBaris(index, { discountAmount: event.target.value })}
              />
            </div>
          </div>
        ))}

        <div className={ACTIONS}>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => setBaris([...baris, barisKosong()])}
          >
            Tambah barang
          </button>
          {baris.length > 1 ? (
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setBaris(baris.slice(0, -1))}
            >
              Hapus baris terakhir
            </button>
          ) : null}
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="catatan">
            Catatan
          </label>
          <input
            className={INPUT}
            id="catatan"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Kondisi pengiriman atau nomor WhatsApp supplier"
          />
        </div>

        <p className="text-sm text-text-secondary tabular">Total Sementara: {rupiah(total)}</p>

        <div className={ACTIONS}>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={busy || supplierId === '' || locationId === ''}
            onClick={() => void simpan(false)}
          >
            Simpan sebagai draft
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={busy || supplierId === '' || locationId === ''}
            onClick={() => void simpan(true)}
          >
            Simpan lalu ajukan
          </button>
        </div>
      </form>
    </PurchasingShell>
  )
}

function rupiahToNumber(text: string): number {
  const bersih = text.trim().replace(/\./g, '').replace(',', '.')
  if (bersih === '') return 0
  const nilai = Number(bersih)
  return Number.isFinite(nilai) ? nilai : 0
}

/** Baris PO kosong, dipakai saat menambah baris atau menerima usulan dari URL. */
function barisKosong(productId = '', quantity = '1'): BarisPO {
  return { productId, quantity, unitPrice: '', discountAmount: '' }
}
