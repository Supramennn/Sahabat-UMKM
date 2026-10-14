'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type CreatedSale,
  type Customer,
  type CustomersResponse,
  type Location,
  type LocationsResponse,
  type PaymentMethod,
  type PaymentMethodsResponse,
  type ProductSummary,
  type ProductsResponse,
  type StockBalance,
  type StockBalancesResponse,
} from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { formatQty, rupiah } from '../bagian'
import styles from '../penjualan.module.css'

/**
 * PRD 6.4: catat penjualan dengan tanggal, lokasi, item, jumlah, harga jual, diskon,
 * metode pembayaran, dan pelanggan opsional.
 *
 * Bentuk formnya mengikuti PRD 10 untuk ponsel: produk, jumlah, dan alasan di keypad
 * atau di atas lipatan, sedangkan pilihan panjang seperti lokasi dan metode pembayaran
 * ada di bagian atas yang bisa dibuka. Tambah barang tidak memakai dialog, supaya di
 * ponsel tidak ada lapisan yang menutupi daftar barang yang sedang dicari.
 */

interface Baris {
  key: number
  productId: string
  quantity: string
  unitPrice: string
  discountAmount: string
}

let barisKey = 0

function barisKosong(productId = ''): Baris {
  barisKey += 1
  return { key: barisKey, productId, quantity: '1', unitPrice: '', discountAmount: '' }
}

export default function NewSalePage() {
  const app = useApp()
  const router = useRouter()

  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [locationId, setLocationId] = useState('')
  const [soldOn, setSoldOn] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [methodId, setMethodId] = useState('')
  const [methodLabel, setMethodLabel] = useState('')
  const [rows, setRows] = useState<Baris[]>([barisKosong()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const [daftarLokasi, daftarProduk, daftarPelanggan, daftarMetode] = await Promise.all([
        apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`),
        apiGet<ProductsResponse>(`/api/workspaces/${app.workspaceId}/products?limit=200`),
        apiGet<CustomersResponse>(`/api/workspaces/${app.workspaceId}/customers`),
        apiGet<PaymentMethodsResponse>(`/api/workspaces/${app.workspaceId}/payment-methods`),
      ])

      if (berhenti) return

      if (!daftarLokasi.ok) {
        setLoadError(errorMessage(daftarLokasi.error, 'Lokasi tidak bisa dimuat.'))
        setLoading(false)
        return
      }
      if (!daftarProduk.ok) {
        setLoadError(errorMessage(daftarProduk.error, 'Daftar barang tidak bisa dimuat.'))
        setLoading(false)
        return
      }

      const lokasi = daftarLokasi.data.locations
      setLocations(lokasi)
      setProducts(daftarProduk.data.products)
      if (daftarPelanggan.ok) setCustomers(daftarPelanggan.data.customers)
      if (daftarMetode.ok) setMethods(daftarMetode.data.paymentMethods)

      const bawaan = lokasi.find((item) => item.isDefault) ?? lokasi[0]
      if (bawaan) setLocationId(String(bawaan.id))

      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [app.workspaceId])

  // Saldo ikut dimuat supaya jumlah yang diketik bisa dibandingkan dengan stok yang
  // benar-benar ada di lokasi pilihan, sebelum server menolak. Peran tanpa izin
  // laporan stok tidak melihat angkanya di sini; server tetap memeriksanya.
  const [saldoDimuat, setSaldoDimuat] = useState(false)

  useEffect(() => {
    if (!locationId) {
      setBalances([])
      setSaldoDimuat(false)
      return
    }

    let berhenti = false

    void apiGet<StockBalancesResponse>(
      `/api/workspaces/${app.workspaceId}/stock/balances?locationId=${locationId}`,
    ).then((hasil) => {
      if (berhenti) return
      if (!hasil.ok) {
        setBalances([])
        setSaldoDimuat(false)
        return
      }
      setBalances(hasil.data.balances)
      setSaldoDimuat(true)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, locationId])

  const saldoUntuk = useMemo(() => {
    const peta = new Map<number, number>()
    for (const saldo of balances) peta.set(saldo.productId, saldo.quantity)
    return peta
  }, [balances])

  const produkUntuk = useMemo(() => {
    const peta = new Map<number, ProductSummary>()
    for (const product of products) peta.set(product.id, product)
    return peta
  }, [products])

  const total = rows.reduce((jumlah, row) => jumlah + hargaBaris(row), 0)

  function ubahBaris(key: number, perubahan: Partial<Baris>) {
    setRows((sekarang) => sekarang.map((row) => (row.key === key ? { ...row, ...perubahan } : row)))
  }

  function pilihProduk(key: number, productId: string) {
    const produk = produkUntuk.get(Number(productId))
    ubahBaris(key, {
      productId,
      unitPrice: produk?.sellingPrice ? String(produk.sellingPrice) : '',
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const items = rows
      .filter((row) => row.productId !== '')
      .map((row) => ({
        productId: Number(row.productId),
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        discountAmount: row.discountAmount === '' ? null : row.discountAmount,
      }))

    if (items.length === 0) {
      setError('Pilih barangnya dulu.')
      return
    }

    const label =
      methodId === ''
        ? methodLabel
        : methods.find((method) => String(method.id) === methodId)?.name ?? ''

    if (label.trim() === '') {
      setError('Metode pembayaran wajib diisi. Pilih dari daftar atau ketik namanya.')
      return
    }

    setBusy(true)

    const hasil = await apiPost<CreatedSale>(`/api/workspaces/${app.workspaceId}/sales`, {
      locationId: Number(locationId),
      soldOn: soldOn === '' ? null : soldOn,
      customerId: customerId === '' ? null : Number(customerId),
      paymentMethodId: methodId === '' ? null : Number(methodId),
      paymentMethodLabel: label,
      items,
      idempotencyKey: `jual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    })

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penjualan tidak bisa disimpan.'))
      return
    }

    router.push(`/penjualan/${hasil.data.saleId}`)
  }

  if (loading) {
    return (
      <SalesShell activeHref="/penjualan/baru" title="Catat penjualan">
        <p role="status">Memuat barang dan lokasi.</p>
      </SalesShell>
    )
  }

  if (loadError) {
    return (
      <SalesShell activeHref="/penjualan/baru" title="Catat penjualan">
        <ErrorState title="Halaman ini belum bisa dibuka" body={loadError} />
      </SalesShell>
    )
  }

  return (
    <SalesShell activeHref="/penjualan/baru" title="Catat penjualan">
      {error ? <Alert kind="error">{error}</Alert> : null}

      {locations.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada lokasi</p>
          <p className={styles.stateBody}>
            Penjualan selalu mengurangi stok di suatu lokasi, jadi tambahkan lokasi dulu.
          </p>
          <div className={styles.emptyActions}>
            <Link className={styles.linkButton} href="/stok/lokasi">
              Tambah lokasi
            </Link>
          </div>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="lokasi">
              Lokasi
            </label>
            <select
              className={styles.select}
              id="lokasi"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              required
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="tanggal">
              Tanggal
            </label>
            <input
              className={styles.input}
              id="tanggal"
              type="date"
              value={soldOn}
              onChange={(event) => setSoldOn(event.target.value)}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="pelanggan">
              Pelanggan
            </label>
            <select
              className={styles.select}
              id="pelanggan"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">Pelanggan umum</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {rows.map((row, index) => {
          const saldo = saldoUntuk.get(Number(row.productId))
          return (
            <fieldset className={styles.itemRow} key={row.key}>
              <legend className={styles.label}>Barang {index + 1}</legend>

              <div className={styles.itemGrid}>
                <div className={styles.filterGroup}>
                  <label className={styles.label} htmlFor={`produk-${row.key}`}>
                    Barang
                  </label>
                  <select
                    className={styles.select}
                    id={`produk-${row.key}`}
                    value={row.productId}
                    onChange={(event) => pilihProduk(row.key, event.target.value)}
                    required
                  >
                    <option value="">Pilih barang</option>
                    {products
                      .filter((product) => product.status !== 'diarsipkan')
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.label} htmlFor={`jumlah-${row.key}`}>
                    Jumlah
                  </label>
                  <input
                    className={styles.input}
                    id={`jumlah-${row.key}`}
                    type="text"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(event) => ubahBaris(row.key, { quantity: event.target.value })}
                    required
                  />
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.label} htmlFor={`harga-${row.key}`}>
                    Harga jual
                  </label>
                  <input
                    className={styles.input}
                    id={`harga-${row.key}`}
                    type="text"
                    inputMode="numeric"
                    value={row.unitPrice}
                    onChange={(event) => ubahBaris(row.key, { unitPrice: event.target.value })}
                    required
                  />
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.label} htmlFor={`diskon-${row.key}`}>
                    Diskon
                  </label>
                  <input
                    className={styles.input}
                    id={`diskon-${row.key}`}
                    type="text"
                    inputMode="numeric"
                    value={row.discountAmount}
                    onChange={(event) => ubahBaris(row.key, { discountAmount: event.target.value })}
                  />
                </div>

                <div className={styles.itemTotal}>{rupiah(hargaBaris(row))}</div>
              </div>

              <p className={styles.hint}>
                {!saldoDimuat
                  ? 'Stok dicek server saat disimpan, jadi penjualan melebihi stok akan ditolak.'
                  : saldo === undefined
                    ? 'Belum ada saldo untuk barang ini di lokasi ini.'
                    : `Stok tersedia ${formatQty(saldo)} di lokasi ini.`}
              </p>

              {rows.length > 1 ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setRows((sekarang) => sekarang.filter((item) => item.key !== row.key))}
                >
                  Hapus barang {index + 1}
                </button>
              ) : null}
            </fieldset>
          )
        })}

        <div className={styles.actionsTop}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setRows((sekarang) => [...sekarang, barisKosong()])}
          >
            Tambah barang
          </button>
          <p className={styles.itemTotal} aria-live="polite">
            Total {rupiah(total)}
          </p>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="metode-daftar">
              Metode dari daftar
            </label>
            <select
              className={styles.select}
              id="metode-daftar"
              value={methodId}
              onChange={(event) => {
                setMethodId(event.target.value)
                if (event.target.value === '') setMethodLabel('')
              }}
            >
              <option value="">Ketik nama sendiri</option>
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </div>

          {methodId === '' ? (
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="metode-teks">
                Metode pembayaran
              </label>
              <input
                className={styles.input}
                id="metode-teks"
                type="text"
                value={methodLabel}
                onChange={(event) => setMethodLabel(event.target.value)}
                placeholder="Tunai"
                required
              />
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || locations.length === 0}
        >
          {busy ? 'Menyimpan' : 'Simpan penjualan'}
        </button>
      </form>
    </SalesShell>
  )
}

function hargaBaris(row: Baris): number {
  const qty = Number(row.quantity.replace(',', '.'))
  const harga = Number(row.unitPrice.replace(/\./g, '').replace(',', '.'))
  const diskon = row.discountAmount ? Number(row.discountAmount.replace(/\./g, '').replace(',', '.')) : 0
  if (!Number.isFinite(qty) || !Number.isFinite(harga)) return 0
  return Math.round(qty * harga) - (Number.isFinite(diskon) ? diskon : 0)
}