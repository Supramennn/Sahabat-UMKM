'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type CancelledSale, type SaleDetail } from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { badgeFor, formatQty, rupiah } from '../bagian'

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

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat penjualan.
        </p>
      ) : null}

      {!loading && !detail && error ? (
        <ErrorState
          title="Penjualan tidak bisa dibuka"
          body={error ?? 'Penjualan tidak ditemukan.'}
          action={
            <Link
              className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/penjualan"
            >
              Kembali ke daftar penjualan
            </Link>
          }
        />
      ) : null}

      {detail ? (
        <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <div>
              <dt className="text-[0.9375rem] text-text-secondary">Nomor</dt>
              <dd className="text-2xl font-semibold tabular">{detail.sale.number}</dd>
            </div>
            <div>
              <dt className="text-[0.9375rem] text-text-secondary">Tanggal</dt>
              <dd className="text-2xl font-semibold tabular">{detail.sale.soldOn}</dd>
            </div>
            <div>
              <dt className="text-[0.9375rem] text-text-secondary">Total</dt>
              <dd className="text-2xl font-semibold tabular">{rupiah(detail.sale.totalAmount)}</dd>
            </div>
            <div>
              <dt className="text-[0.9375rem] text-text-secondary">Laba kotor</dt>
              <dd className="text-2xl font-semibold tabular">{rupiah(detail.sale.grossProfit)}</dd>
            </div>
          </dl>

          <p className="text-sm text-text-secondary">
            <span className={badgeFor(detail.sale.status)}> {detail.sale.statusLabel} </span>{' '}
            Lokasi {detail.sale.locationName} · Metode {detail.sale.paymentMethodLabel} · Pelanggan{' '}
            {detail.sale.customerName ?? 'umum'} · Dicatat oleh {detail.sale.createdByName}
          </p>

          {detail.sale.status === 'dibatalkan' ? (
            <p className="text-sm text-text-secondary">
              Dibatalkan{detail.sale.cancelledAt ? ` pada ${detail.sale.cancelledAt.slice(0, 10)}` : ''}
              {detail.sale.cancelReason ? ` dengan alasan "${detail.sale.cancelReason}"` : ''}. Stok
              yang sudah keluar dikembalikan lewat baris stok baru, jadi riwayat tetap utuh.
            </p>
          ) : null}

          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full text-sm">
              <caption className="visually-hidden">Barang yang terjual pada penjualan ini</caption>
              <thead className="bg-background text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Barang
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Jumlah
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Harga jual
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Diskon
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Harga pokok
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-3 py-2">
                      {item.productName} ({item.sku})
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {formatQty(item.quantity)} {item.unitCode}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(item.discountAmount)}</td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(item.lineTotal)}</td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(item.costTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-subtle">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    Total
                  </th>
                  <td colSpan={4} className="px-3 py-2 text-right tabular">
                    {rupiah(detail.sale.totalAmount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{rupiah(detail.sale.costTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0 desktop:hidden">
            {detail.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[1.0625rem] font-semibold text-primary">{item.productName}</span>
                  <span className="font-semibold tabular">{rupiah(item.lineTotal)}</span>
                </span>
                <span className="text-sm text-text-secondary">
                  {formatQty(item.quantity)} {item.unitCode} x {rupiah(item.unitPrice)}
                  {item.discountAmount > 0 ? `, diskon ${rupiah(item.discountAmount)}` : ''}
                </span>
                <span className="text-sm text-text-secondary">Harga pokok {rupiah(item.costTotal)}</span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-text-secondary">
            Harga pokok memakai rata-rata bergerak pada saat penjualan dicatat, jadi laporan bulan
            lalu tidak berubah karena ada pembelian baru bulan ini.
          </p>

          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/penjualan"
            >
              Kembali ke daftar
            </Link>
            {detail.sale.status === 'selesai' ? (
              <button
                type="button"
                className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-danger bg-surface px-4 text-base font-medium text-danger transition-colors duration-150 enabled:hover:bg-danger-surface disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
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
