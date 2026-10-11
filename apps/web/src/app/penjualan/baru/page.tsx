'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type LocationsResponse,
  type ProductSummary,
  type ProductsResponse,
  type Customer,
  type CustomersResponse,
} from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import { rupiah, parseJumlah, kunciIdempotensi } from '../bagian'
import styles from '../penjualan.module.css'

interface BarisPenjualan {
  productId: string
  quantity: string
  unitPrice: string
  discountAmount: string
}

interface PaymentMethodOption {
  id: number
  name: string
  isActive: boolean
  sortOrder: number
}

export default function NewSalePage() {
  const app = useApp()
  const router = useRouter()

  const [locations, setLocations] = useState<LocationsResponse['locations']>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const [locationId, setLocationId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [soldOn, setSoldOn] = useState('')
  const [note, setNote] = useState('')
  const [baris, setBaris] = useState<BarisPenjualan[]>([barisKosong()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) {
        const aktif = result.data.locations.filter((l) => !l.archived)
        setLocations(aktif)
        setLocationId(String(aktif.find((l) => l.isDefault)?.id ?? aktif[0]?.id ?? ''))
      }
    })
    void apiGet<ProductsResponse>(
      `/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`,
    ).then((result) => {
      if (result.ok) setProducts(result.data.products)
    })
    void apiGet<CustomersResponse>(`/api/workspaces/${app.workspaceId}/customers`).then((result) => {
      if (result.ok) setCustomers(result.data.customers)
    })
    void apiGet<{ methods: PaymentMethodOption[] }>(`/api/workspaces/${app.workspaceId}/payment-methods`).then(
      (result) => {
        if (result.ok) {
          setPaymentMethods(result.data.methods)
          setPaymentMethod(result.data.methods[0]?.name ?? '')
        }
      },
    )
  }, [app.workspaceId])

  const total = baris.reduce(
    (jumlah, item) =>
      jumlah +
      rupiahToNumber(item.unitPrice) * parseJumlah(item.quantity)! -
      rupiahToNumber(item.discountAmount),
    0,
  )

  function perbaruiBaris(index: number, perubahan: Partial<BarisPenjualan>) {
    setBaris(baris.map((item, posisi) => (posisi === index ? { ...item, ...perubahan } : item)))
  }

  async function simpan() {
    setBusy(true)
    setError(null)

    const items = baris
      .filter((item) => item.productId !== '' && item.quantity !== '' && item.unitPrice !== '')
      .map((item) => {
        const qty = parseJumlah(item.quantity)
        if (!qty) throw new Error(`Jumlah tidak valid untuk produk ${item.productId}`)
        return {
          productId: Number(item.productId),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount === '' ? null : item.discountAmount,
        }
      })

    if (items.length === 0) {
      setBusy(false)
      setError('Penjualan harus punya minimal satu barang dengan jumlah dan harga.')
      return
    }
    if (!locationId) {
      setBusy(false)
      setError('Pilih lokasi.')
      return
    }
    if (!paymentMethod) {
      setBusy(false)
      setError('Pilih metode pembayaran.')
      return
    }

    const hasil = await apiPost<{ saleId: number; number: string; grossProfit: number }>(
      `/api/workspaces/${app.workspaceId}/sales`,
      {
        customerId: customerId === '' ? null : Number(customerId),
        locationId: Number(locationId),
        soldOn: soldOn === '' ? null : soldOn,
        paymentMethod,
        note: note || null,
        items,
        idempotencyKey: kunciIdempotensi('jual'),
      },
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penjualan tidak bisa disimpan.'))
      return
    }

    router.push(`/penjualan/${hasil.data.saleId}`)
  }

  return (
    <SalesShell activeHref="/penjualan/daftar" title="Catat penjualan">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="lokasi">
            Lokasi
          </label>
          <select className={styles.select} id="lokasi" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="pelanggan">
            Pelanggan (opsional)
          </label>
          <select className={styles.select} id="pelanggan" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Pelanggan umum (walk-in)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="metode">
            Metode pembayaran
          </label>
          <select className={styles.select} id="metode" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="tanggal">
            Tanggal penjualan
          </label>
          <input className={styles.input} id="tanggal" type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} />
        </div>

        {baris.map((item, index) => (
          <div key={index} className={styles.itemRow}>
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor={`barang-${index}`}>Barang</label>
              <select
                className={styles.select}
                id={`barang-${index}`}
                value={item.productId}
                onChange={(e) => perbaruiBaris(index, { productId: e.target.value })}
              >
                <option value="">Pilih barang</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) - Harga jual: {rupiah(p.sellingPrice ?? 0)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor={`jumlah-${index}`}>Jumlah</label>
              <input
                className={styles.input}
                id={`jumlah-${index}`}
                inputMode="decimal"
                value={item.quantity}
                onChange={(e) => perbaruiBaris(index, { quantity: e.target.value })}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor={`harga-${index}`}>Harga jual per satuan</label>
              <input
                className={styles.input}
                id={`harga-${index}`}
                inputMode="numeric"
                value={item.unitPrice}
                onChange={(e) => perbaruiBaris(index, { unitPrice: e.target.value })}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor={`diskon-${index}`}>Diskon per baris (opsional)</label>
              <input
                className={styles.input}
                id={`diskon-${index}`}
                inputMode="numeric"
                value={item.discountAmount}
                onChange={(e) => perbaruiBaris(index, { discountAmount: e.target.value })}
              />
            </div>
          </div>
        ))}

        <div className={styles.actions}>
          <button type="button" className={styles.linkButton} onClick={() => setBaris([...baris, barisKosong()])}>
            Tambah barang
          </button>
          {baris.length > 1 && (
            <button type="button" className={styles.linkButton} onClick={() => setBaris(baris.slice(0, -1))}>
              Hapus baris terakhir
            </button>
          )}
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="catatan">Catatan</label>
          <input className={styles.input} id="catatan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan tambahan" />
        </div>

        <p className={styles.cardMeta}>Total: {rupiah(total)}</p>

        <div className={styles.actions}>
          <button type="button" className={styles.submit} disabled={busy} onClick={() => void simpan()}>
            {busy ? 'Menyimpan' : 'Simpan penjualan'}
          </button>
        </div>
      </form>
    </SalesShell>
  )
}

function rupiahToNumber(text: string): number {
  const bersih = text.trim().replace(/\./g, '').replace(',', '.')
  if (bersih === '') return 0
  const nilai = Number(bersih)
  return Number.isFinite(nilai) ? nilai : 0
}

function barisKosong(): BarisPenjualan {
  return { productId: '', quantity: '1', unitPrice: '', discountAmount: '' }
}