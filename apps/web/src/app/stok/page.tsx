'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../components/app-context'
import { AppShell } from '../components/shell'
import { ErrorState } from '../components/ui'
import {
  apiGet,
  errorMessage,
  type ProductSummary,
  type ProductsResponse,
} from '../../lib/api'
import { cx } from '../../lib/cx'
import { Pagination, badgeClass, formatQty } from './bagian'

/**
 * PRD 5: Stok > Barang. Daftar produk dengan pencarian, filter status, dan
 * pagination. Di ponsel tabel berubah menjadi daftar kartu dengan kolom terpenting
 * saja (PRD 10).
 */

const STATUS_FILTER = [
  { value: '', label: 'Semua status' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'nonaktif', label: 'Nonaktif' },
  { value: 'diarsipkan', label: 'Diarsipkan' },
] as const

const PAGE_SIZE = 20

export default function ProductsPage() {
  const app = useApp()

  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (status) params.set('status', status)
    if (search.trim()) params.set('search', search.trim())

    void apiGet<ProductsResponse>(`/api/workspaces/${app.workspaceId}/products?${params}`).then(
      (result) => {
        if (berhenti) return
        if (result.ok) {
          setProducts(result.data.products)
          setTotal(result.data.pagination.total)
          setError(null)
        } else {
          setError(errorMessage(result.error, 'Daftar barang tidak bisa dimuat.'))
        }
        setLoading(false)
      },
    )

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, offset, status, search])

  function onSearch(event: FormEvent) {
    event.preventDefault()
    setOffset(0)
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok"
      breadcrumb="Stok"
      title="Barang"
      actions={
        <>
          <a
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
            href="/stok/peringatan"
          >
            Perlu perhatian
          </a>
          <a
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
            href="/stok/input"
          >
            Catat stok
          </a>
          <a
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
            href="/stok/impor"
          >
            Impor barang
          </a>
          <a
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
            href="/stok/produk/baru"
          >
            Tambah barang
          </a>
        </>
      }
    >
      <form className="flex flex-wrap items-end gap-3" onSubmit={onSearch} role="search">
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="cari">
            Cari barang
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="cari"
            name="cari"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
            placeholder="Nama atau SKU"
          />
        </div>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="status">
            Status
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setOffset(0)
            }}
          >
            {STATUS_FILTER.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      {error ? <ErrorState title="Daftar barang gagal dimuat" body={error} /> : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar barang.
        </p>
      ) : products && products.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada barang</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Tambahkan barang satu per satu, atau impor dari berkas CSV. Saldo stok terisi
            sendiri setelah barang masuk dicatat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/stok/impor"
            >
              Impor dari CSV
            </a>
            <a
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/stok/produk/baru"
            >
              Tambah barang pertama
            </a>
            <a
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/stok/input"
            >
              Catat stok masuk
            </a>
          </div>
        </div>
      ) : null}

      {!loading && products && products.length > 0 ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 desktop:hidden">
            {products.map((product) => (
              <li key={product.id}>
                <a
                  className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
                  href={`/stok/produk/${product.id}`}
                >
                  <span className="text-[1.0625rem] font-semibold text-primary">{product.name}</span>
                  <span className="text-sm text-text-secondary">
                    {product.sku}
                    {product.categoryName ? ` · ${product.categoryName}` : ''}
                  </span>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span
                      className={cx(
                        'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium',
                        badgeClass(product.stockStatus),
                      )}
                    >
                      {product.stockStatusLabel}
                    </span>
                    <span className="tabular font-bold">
                      {formatQty(product.totalQuantity)} {product.unitCode}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full text-sm">
              <caption className="visually-hidden">Daftar barang</caption>
              <thead className="bg-background text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Barang
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Kategori
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Saldo
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-3 py-2">
                      <a href={`/stok/produk/${product.id}`}>{product.name}</a>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{product.sku}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      {product.categoryName ?? 'Tanpa kategori'}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {formatQty(product.totalQuantity)} {product.unitCode}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cx(
                          'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium',
                          badgeClass(product.stockStatus),
                        )}
                      >
                        {product.stockStatusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      ) : null}
    </AppShell>
  )
}
