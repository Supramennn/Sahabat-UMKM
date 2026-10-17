'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  errorMessage,
  type Location,
  type LocationsResponse,
  type ProductSummary,
  type ProductsResponse,
  type PurchaseOrder,
  type SuppliersResponse,
} from '../../../lib/api'
import { cx } from '../../../lib/cx'
import { badgeFor, rupiah } from '../bagian'
import { PurchasingShell } from '../pembelian-shell'

/**
 * PRD 5: Pembelian > Purchase Order. Daftar dengan filter status, dan aksi
 * membuat PO baru. PRD 6.3 minta PO bisa dibuat langsung dari daftar stok
 * rendah dengan jumlah usulan yang bisa diubah; tombolnya ada di sini dan
 * mengarah ke halaman POST dari peringatan stok.
 */

const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'
const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const LINK_BUTTON = 'inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary'

const STATUS = [
  { value: '', label: 'Semua status' },
  { value: 'draft', label: 'Draft' },
  { value: 'diajukan', label: 'Diajukan' },
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'diterima_sebagian', label: 'Diterima Sebagian' },
  { value: 'diterima', label: 'Diterima' },
  { value: 'ditolak', label: 'Ditolak' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
  { value: 'ditutup', label: 'Ditutup' },
] as const

export default function PurchaseOrdersPage() {
  const app = useApp()

  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SuppliersResponse['suppliers']>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [products, setProducts] = useState<ProductSummary[]>([])

  useEffect(() => {
    void apiGet<SuppliersResponse>(`/api/workspaces/${app.workspaceId}/suppliers`).then((result) => {
      if (result.ok) setSuppliers(result.data.suppliers)
    })
    void apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`).then((result) => {
      if (result.ok) setLocations(result.data.locations.filter((item) => !item.archived))
    })
    void apiGet<ProductsResponse>(
      `/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`,
    ).then((result) => {
      if (result.ok) setProducts(result.data.products)
    })
  }, [app.workspaceId])

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    const params = new URLSearchParams({ limit: '50' })
    if (status) params.set('status', status)

    void apiGet<{ orders: PurchaseOrder[] }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders?${params}`,
    ).then((result) => {
      if (berhenti) return
      if (result.ok) {
        setOrders(result.data.orders)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Daftar PO tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, status])

  const totals = {
    menunggu: orders?.filter((item) => item.status === 'diajukan').length ?? 0,
    berjalan: orders?.filter((item) => item.status === 'diterima_sebagian').length ?? 0,
  }

  return (
    <PurchasingShell
      activeHref="/pembelian/po"
      title="Purchase order"
      actions={
        <a className={LINK_BUTTON} href="/pembelian/po/baru">
          Buat PO
        </a>
      }
    >
      <div className="flex flex-wrap gap-2">
        <span className={cx(BADGE, 'border-warning text-warning')}>
          Menunggu persetujuan {totals.menunggu}
        </span>
        <span className={cx(BADGE, 'border-success text-success')}>
          Diterima sebagian {totals.berjalan}
        </span>
      </div>

      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="status">
          Status
        </label>
        <select
          className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {STATUS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar purchase order.
        </p>
      ) : orders && orders.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada purchase order</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Buat PO untuk memesan barang ke supplier, lalu catat penerimaannya saat barang
            datang. Barang baru menambah stok setelah penerimaan dicatat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={LINK_BUTTON} href="/pembelian/po/baru">
              Buat PO pertama
            </a>
            <a className={LINK_BUTTON} href="/stok/peringatan">
              Dari daftar stok rendah
            </a>
          </div>
        </div>
      ) : null}

      {!loading && orders && orders.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2 desktop:hidden">
            {orders.map((order) => (
              <li key={order.id}>
                <a className={CARD} href={`/pembelian/po/${order.id}`}>
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-primary tabular">{order.number}</span>
                    <span className={badgeFor(order.status)}>{order.statusLabel}</span>
                  </span>
                  <span className="text-sm text-text-secondary">
                    {order.supplierName} · {order.locationName}
                  </span>
                  <span className="text-sm text-text-secondary tabular">
                    {rupiah(order.totalAmount)} · {order.orderedOn}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full border-collapse text-sm">
              <caption className="visually-hidden">Daftar purchase order</caption>
              <thead className="bg-background text-left text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2">Nomor</th>
                  <th scope="col" className="px-3 py-2">Supplier</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2">
                      <a href={`/pembelian/po/${order.id}`}>{order.number}</a>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{order.supplierName}</td>
                    <td className="px-3 py-2">
                      <span className={badgeFor(order.status)}>{order.statusLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(order.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {suppliers.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Supplier masih kosong. Tambahkan supplier dulu sebelum membuat PO.
        </p>
      ) : null}
      {locations.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Lokasi masih kosong. Tambahkan lokasi dulu supaya stok bisa dipisahkan per tempat.
        </p>
      ) : null}
      {products.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Barang masih kosong. Tambahkan barang dulu sebelum membuat PO.
        </p>
      ) : null}
    </PurchasingShell>
  )
}

