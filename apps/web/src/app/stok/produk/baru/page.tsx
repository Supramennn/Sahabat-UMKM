'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../../components/app-context'
import { AppShell } from '../../../components/shell'
import { Alert } from '../../../components/ui'
import { apiGet, apiPost, errorMessage, type CategoriesResponse } from '../../../../lib/api'

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

      <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="nama">
            Nama barang
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="nama"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Contoh: Kopi bubuk 250 g"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="sku">
            SKU
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            placeholder="Kode unik di workspace ini"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="satuan">
            Satuan
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="kategori">
            Kategori (opsional)
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="harga-jual">
            Harga jual (opsional)
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="harga-jual"
            inputMode="numeric"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="stok-minimum">
            Batas minimum stok (opsional)
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="stok-minimum"
            inputMode="decimal"
            value={minStock}
            onChange={(event) => setMinStock(event.target.value)}
          />
          <p className="text-sm text-text-secondary">
            Batas minimum dipakai untuk peringatan stok rendah dan untuk membuat daftar barang
            yang perlu dibeli.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy || sku === '' || name === ''}
        >
          {busy ? 'Menyimpan' : 'Simpan barang'}
        </button>
      </form>
    </AppShell>
  )
}
