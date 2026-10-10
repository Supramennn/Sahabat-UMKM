'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../../components/app-context'
import { AppShell } from '../../../components/shell'
import { Alert } from '../../../components/ui'
import { apiGet, apiPost, errorMessage, type CategoriesResponse } from '../../../../lib/api'
import styles from '../../stok.module.css'

/**
 * Formulir produk. Satuan memakai daftar sarat, bukan teks bebas, supaya laporan
 * tetap bisa mengelompokkan barang dan tidak ada satuan yang salah ketik (B-07).
 */

const SATUAN = [
  { value: 'pcs', label: 'pcs' },
  { value: 'bungkus', label: 'bungkus' },
  { value: 'box', label: 'box' },
  { value: 'karung', label: 'karung' },
  { value: 'lusin', label: 'lusin' },
  { value: 'rim', label: 'rim' },
  { value: 'pack', label: 'pack' },
  { value: 'sachet', label: 'sachet' },
  { value: 'kg', label: 'kg' },
  { value: 'gram', label: 'gram' },
  { value: 'ons', label: 'ons' },
  { value: 'liter', label: 'liter' },
  { value: 'ml', label: 'ml' },
  { value: 'galon', label: 'galon' },
  { value: 'dozen', label: 'dozen' },
  { value: 'paket', label: 'paket' },
] as const

export default function NewProductPage() {
  const app = useApp()
  const router = useRouter()

  const [categories, setCategories] = useState<CategoriesResponse['categories']>([])
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [unitCode, setUnitCode] = useState('pcs')
  const [categoryId, setCategoryId] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [minStock, setMinStock] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void apiGet<CategoriesResponse>(`/api/workspaces/${app.workspaceId}/categories`).then((result) => {
      if (result.ok) setCategories(result.data.categories)
    })
  }, [app.workspaceId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<{ productId: number }>(`/api/workspaces/${app.workspaceId}/products`, {
      sku,
      name,
      unitCode,
      categoryId: categoryId === '' ? null : Number(categoryId),
      sellingPrice: sellingPrice === '' ? null : sellingPrice,
      minStock: minStock === '' ? null : minStock,
    })

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Barang tidak bisa disimpan.'))
      return
    }

    router.push(`/stok/produk/${result.data.productId}`)
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok"
      breadcrumb="Stok"
      title="Tambah barang"
    >
      {error ? <Alert kind="error">{error}</Alert> : null}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama">
            Nama barang
          </label>
          <input
            className={styles.input}
            id="nama"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Contoh: Kopi bubuk 250 g"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="sku">
            SKU
          </label>
          <input
            className={styles.input}
            id="sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            placeholder="Kode unik di workspace ini"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="satuan">
            Satuan
          </label>
          <select
            className={styles.select}
            id="satuan"
            value={unitCode}
            onChange={(event) => setUnitCode(event.target.value)}
          >
            {SATUAN.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="kategori">
            Kategori (opsional)
          </label>
          <select
            className={styles.select}
            id="kategori"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Tanpa kategori</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="harga-jual">
            Harga jual (opsional)
          </label>
          <input
            className={styles.input}
            id="harga-jual"
            inputMode="numeric"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="stok-minimum">
            Batas minimum stok (opsional)
          </label>
          <input
            className={styles.input}
            id="stok-minimum"
            inputMode="decimal"
            value={minStock}
            onChange={(event) => setMinStock(event.target.value)}
          />
          <p className={styles.hint}>
            Batas minimum dipakai untuk peringatan stok rendah dan untuk membuat daftar barang
            yang perlu dibeli.
          </p>
        </div>

        <button type="submit" className={styles.submit} disabled={busy || sku === '' || name === ''}>
          {busy ? 'Menyimpan' : 'Simpan barang'}
        </button>
      </form>
    </AppShell>
  )
}
