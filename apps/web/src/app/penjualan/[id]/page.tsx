'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type CancelledSale, type SaleDetail } from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { badgeFor, formatQty, rupiah } from '../bagian'
import styles from '../penjualan.module.css'

/**
 * Detail satu penjualan (PRD 6.4). Halaman ini juga menjadi tempat pembatalan,
 * karena pembatalan membuat transaksi pembalik dan mengubah stok, jadi keduanya
 * harus terlihat di layar yang sama (PRD 6.2 dan 6.4).
 */

export default function SaleDetailPage() {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const saleId = params.id

  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    const hasil = await apiGet<SaleDetail>(`/api/workspaces/${app.workspaceId}/sales/${saleId}`)

    setLoading(false)
    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penjualan tidak bisa dimuat.'))
      return
    }
    setError(null)
    setDetail(hasil.data)
  }, [app.workspaceId, saleId])

  useEffect(() => {
    void muat()
  }, [muat])

  async function batalkan() {
    if (!detail) return

    // PRD 10: tindakan yang tidak bisa dibatalkan meminta konfirmasi yang menyebut
    // objeknya. Pembatalan mengembalikan stok, jadi pesan menyebut efeknya, bukan
    // hanya namanya.
    const konfirmasi = window.confirm(
      `Batalkan penjualan ${detail.sale.number}?\n` +
        'Stok barang yang terjual akan dikembalikan dan penjualan ini tidak dihitung lagi di laporan.',
    )
    if (!konfirmasi) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    const hasil = await apiPost<CancelledSale>(
      `/api/workspaces/${app.workspaceId}/sales/${saleId}/cancel`,
      {},
    )

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Penjualan tidak bisa dibatalkan.'))
      return
    }

    setSuccess(
      hasil.data.replayed
        ? `Penjualan ${hasil.data.number} sudah dalam keadaan dibatalkan.`
        : `Penjualan ${hasil.data.number} dibatalkan. Stok barang yang terjual sudah dikembalikan.`,
    )
    await muat()
  }

  return (
    <SalesShell activeHref="/penjualan" title="Detail penjualan">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? <p role="status">Memuat penjualan.</p> : null}

      {!loading && !detail && error ? (
        <ErrorState
          title="Penjualan tidak bisa dibuka"
          body={error ?? 'Penjualan tidak ditemukan.'}
          action={
            <Link className={styles.linkButton} href="/penjualan">
              Kembali ke daftar penjualan
            </Link>
          }
        />
      ) : null}

      {detail ? (
        <>
          <dl className={styles.summary}>
            <div>
              <dt className={styles.summaryLabel}>Nomor</dt>
              <dd className={styles.summaryValue}>{detail.sale.number}</dd>
            </div>
            <div>
              <dt className={styles.summaryLabel}>Tanggal</dt>
              <dd className={styles.summaryValue}>{detail.sale.soldOn}</dd>
            </div>
            <div>
              <dt className={styles.summaryLabel}>Total</dt>
              <dd className={styles.summaryValue}>{rupiah(detail.sale.totalAmount)}</dd>
            </div>
            <div>
              <dt className={styles.summaryLabel}>Laba kotor</dt>
              <dd className={styles.summaryValue}>{rupiah(detail.sale.grossProfit)}</dd>
            </div>
          </dl>

          <p className={styles.cardMeta}>
            <span className={badgeFor(detail.sale.status)}> {detail.sale.statusLabel} </span>{' '}
            Lokasi {detail.sale.locationName} · Metode {detail.sale.paymentMethodLabel} · Pelanggan{' '}
            {detail.sale.customerName ?? 'umum'} · Dicatat oleh {detail.sale.createdByName}
          </p>

          {detail.sale.status === 'dibatalkan' ? (
            <p className={styles.hint}>
              Dibatalkan{detail.sale.cancelledAt ? ` pada ${detail.sale.cancelledAt.slice(0, 10)}` : ''}
              {detail.sale.cancelReason ? ` dengan alasan "${detail.sale.cancelReason}"` : ''}. Stok
              yang sudah keluar dikembalikan lewat baris stok baru, jadi riwayat tetap utuh.
            </p>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Barang yang terjual pada penjualan ini</caption>
              <thead>
                <tr>
                  <th scope="col">Barang</th>
                  <th scope="col" className={styles.numeric}>
                    Jumlah
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Harga jual
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Diskon
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Total
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Harga pokok
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.productName} ({item.sku})
                    </td>
                    <td className={styles.numeric}>
                      {formatQty(item.quantity)} {item.unitCode}
                    </td>
                    <td className={styles.numeric}>{rupiah(item.unitPrice)}</td>
                    <td className={styles.numeric}>{rupiah(item.discountAmount)}</td>
                    <td className={styles.numeric}>{rupiah(item.lineTotal)}</td>
                    <td className={styles.numeric}>{rupiah(item.costTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td colSpan={4} className={styles.numeric}>
                    {rupiah(detail.sale.totalAmount)}
                  </td>
                  <td className={styles.numeric}>{rupiah(detail.sale.costTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className={styles.list}>
            {detail.items.map((item) => (
              <li key={item.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{item.productName}</span>
                  <span className={styles.cardTotal}>{rupiah(item.lineTotal)}</span>
                </span>
                <span className={styles.cardMeta}>
                  {formatQty(item.quantity)} {item.unitCode} x {rupiah(item.unitPrice)}
                  {item.discountAmount > 0 ? `, diskon ${rupiah(item.discountAmount)}` : ''}
                </span>
                <span className={styles.cardMeta}>Harga pokok {rupiah(item.costTotal)}</span>
              </li>
            ))}
          </ul>

          <p className={styles.hint}>
            Harga pokok memakai rata-rata bergerak pada saat penjualan dicatat, jadi laporan bulan
            lalu tidak berubah karena ada pembelian baru bulan ini.
          </p>

          <div className={styles.actions}>
            <Link className={styles.linkButton} href="/penjualan">
              Kembali ke daftar
            </Link>
            {detail.sale.status === 'selesai' ? (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void batalkan()}
                disabled={busy}
              >
                {busy ? 'Membatalkan' : 'Batalkan penjualan'}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </SalesShell>
  )
}