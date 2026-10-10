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
import { Pagination, badgeClass, formatQty } from './bagian'
import styles from './stok.module.css'

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
          <a className={styles.paginationLink} href="/stok/peringatan">
            Perlu perhatian
          </a>
          <a className={styles.paginationLink} href="/stok/input">
            Catat stok
          </a>
          <a className={styles.paginationLink} href="/stok/impor">
            Impor barang
          </a>
          <a className={styles.paginationLink} href="/stok/produk/baru">
            Tambah barang
          </a>
        </>
      }
    >
      <form className={styles.filters} onSubmit={onSearch} role="search">
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="cari">
            Cari barang
          </label>
          <input
            className={styles.input}
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
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="status">
            Status
          </label>
          <select
            className={styles.select}
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
        <p role="status">Memuat daftar barang.</p>
      ) : products && products.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada barang</p>
          <p className={styles.stateBody}>
            Tambahkan barang satu per satu, atau impor dari berkas CSV. Saldo stok terisi
            sendiri setelah barang masuk dicatat.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.paginationLink} href="/stok/impor">
              Impor dari CSV
            </a>
            <a className={styles.paginationLink} href="/stok/produk/baru">
              Tambah barang pertama
            </a>
            <a className={styles.paginationLink} href="/stok/input">
              Catat stok masuk
            </a>
          </div>
        </div>
      ) : null}

      {!loading && products && products.length > 0 ? (
        <>
          <ul className={styles.list}>
            {products.map((product) => (
              <li key={product.id}>
                <a className={styles.card} href={`/stok/produk/${product.id}`}>
                  <span className={styles.cardName}>{product.name}</span>
                  <span className={styles.cardMeta}>
                    {product.sku}
                    {product.categoryName ? ` · ${product.categoryName}` : ''}
                  </span>
                  <span className={styles.cardRow}>
                    <span className={`${styles.badge} ${badgeClass(product.stockStatus)}`}>
                      {product.stockStatusLabel}
                    </span>
                    <span className={styles.quantity}>
                      {formatQty(product.totalQuantity)} {product.unitCode}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Daftar barang</caption>
              <thead>
                <tr>
                  <th scope="col">Barang</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Kategori</th>
                  <th scope="col" className={styles.numeric}>
                    Saldo
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <a href={`/stok/produk/${product.id}`}>{product.name}</a>
                    </td>
                    <td className={styles.muted}>{product.sku}</td>
                    <td className={styles.muted}>{product.categoryName ?? 'Tanpa kategori'}</td>
                    <td className={styles.numeric}>
                      {formatQty(product.totalQuantity)} {product.unitCode}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${badgeClass(product.stockStatus)}`}>
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
