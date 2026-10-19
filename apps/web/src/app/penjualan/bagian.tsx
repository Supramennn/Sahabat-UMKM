'use client'

import { formatQuantity, formatRupiah } from '@sahabat/shared'
import { cx } from '../../lib/cx'

/**
 * Bagian yang dipakai beberapa halaman penjualan. Berada di berkas sendiri karena
 * berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

export function rupiah(amount: number): string {
  return formatRupiah(amount)
}

/** Jumlah barang boleh pecahan, jadi pemisah desimalnya koma seperti di Indonesia. */
export function formatQty(value: number): string {
  return formatQuantity(value)
}

/**
 * Status penjualan ditulis sebagai teks dan warna sekaligus. Warna saja tidak cukup
 * untuk pengguna dengan penglihatan warna terbatas dan dalam mode kontras paksa
 * (PRD 10).
 */
const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'

export function badgeFor(status: string): string {
  return cx(BADGE, status === 'dibatalkan' ? 'border-danger text-danger' : 'border-success text-success')
}

export function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number
  offset: number
  limit: number
  onChange: (offset: number) => void
}) {
  const dari = total === 0 ? 0 : offset + 1
  const sampai = Math.min(offset + limit, total)

  return (
    <nav
      className="flex flex-wrap items-center gap-3 text-sm text-text-secondary"
      aria-label="Halaman daftar penjualan"
    >
      <span>
        Menampilkan {dari} sampai {sampai} dari {total} penjualan
      </span>
      {offset > 0 ? (
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </button>
      ) : null}
      {sampai < total ? (
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </button>
      ) : null}
    </nav>
  )
}
