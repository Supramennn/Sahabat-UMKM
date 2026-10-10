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
import { badgeFor, rupiah } from '../bagian'
import { PurchasingShell } from '../pembelian-shell'
import styles from '../pembelian.module.css'

/**
 * PRD 5: Pembelian > Purchase Order. Daftar dengan filter status, dan aksi
 * membuat PO baru. PRD 6.3 minta PO bisa dibuat langsung dari daftar stok
 * rendah dengan jumlah usulan yang bisa diubah; tombolnya ada di sini dan
 * mengarah ke halaman POST dari peringatan stok.
 */

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
        <a className={styles.paginationLink} href="/pembelian/po/baru">
          Buat PO
        </a>
      }
    >
      <div className={styles.actions}>
        <span className={`${styles.badge} ${styles.badgePending}`}>
          Menunggu persetujuan {totals.menunggu}
        </span>
        <span className={`${styles.badge} ${styles.badgeOk}`}>
          Diterima sebagian {totals.berjalan}
        </span>
      </div>

      <div className={styles.filterGroup}>
        <label className={styles.label} htmlFor="status">
          Status
        </label>
        <select
          className={styles.select}
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
        <p role="status">Memuat daftar purchase order.</p>
      ) : orders && orders.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada purchase order</p>
          <p className={styles.stateBody}>
            Buat PO untuk memesan barang ke supplier, lalu catat penerimaannya saat barang
            datang. Barang baru menambah stok setelah penerimaan dicatat.
          </p>
          <div className={styles.emptyActions}>
            <a className={styles.paginationLink} href="/pembelian/po/baru">
              Buat PO pertama
            </a>
            <a className={styles.paginationLink} href="/stok/peringatan">
              Dari daftar stok rendah
            </a>
          </div>
        </div>
      ) : null}

      {!loading && orders && orders.length > 0 ? (
        <>
          <ul className={styles.list}>
            {orders.map((order) => (
              <li key={order.id}>
                <a className={styles.card} href={`/pembelian/po/${order.id}`}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{order.number}</span>
                    <span className={badgeFor(order.status)}>{order.statusLabel}</span>
                  </span>
                  <span className={styles.cardMeta}>
                    {order.supplierName} · {order.locationName}
                  </span>
                  <span className={styles.cardMeta}>
                    {rupiah(order.totalAmount)} · {order.orderedOn}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Daftar purchase order</caption>
              <thead>
                <tr>
                  <th scope="col">Nomor</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={styles.numeric}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <a href={`/pembelian/po/${order.id}`}>{order.number}</a>
                    </td>
                    <td className={styles.muted}>{order.supplierName}</td>
                    <td>
                      <span className={badgeFor(order.status)}>{order.statusLabel}</span>
                    </td>
                    <td className={styles.numeric}>{rupiah(order.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {suppliers.length === 0 ? (
        <p className={styles.hint}>
          Supplier masih kosong. Tambahkan supplier dulu sebelum membuat PO.
        </p>
      ) : null}
      {locations.length === 0 ? (
        <p className={styles.hint}>
          Lokasi masih kosong. Tambahkan lokasi dulu supaya stok bisa dipisahkan per tempat.
        </p>
      ) : null}
      {products.length === 0 ? (
        <p className={styles.hint}>
          Barang masih kosong. Tambahkan barang dulu sebelum membuat PO.
        </p>
      ) : null}
    </PurchasingShell>
  )
}

