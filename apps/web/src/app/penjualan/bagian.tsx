'use client'

import { formatRupiah } from '@sahabat/shared'
import styles from './penjualan.module.css'

/**
 * Bagian yang dipakai beberapa halaman penjualan. Berada di berkas sendiri karena
 * berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

export function rupiah(amount: number): string {
  return formatRupiah(amount)
}

/** Jumlah barang boleh pecahan, jadi pemisah desimalnya koma seperti di Indonesia. */
export function formatQty(value: number): string {
  const bulat = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
  const [bagianBulat, bagianDesimal] = bulat.split('.')
  const denganPemisah = (bagianBulat ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return bagianDesimal ? `${denganPemisah},${bagianDesimal}` : denganPemisah
}

/**
 * Status penjualan ditulis sebagai teks dan warna sekaligus. Warna saja tidak cukup
 * untuk pengguna dengan penglihatan warna terbatas dan dalam mode kontras paksa
 * (PRD 10).
 */
export function badgeFor(status: string): string {
  return status === 'dibatalkan'
    ? `${styles.badge} ${styles.badgeDanger}`
    : `${styles.badge} ${styles.badgeOk}`
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
    <nav className={styles.pagination} aria-label="Halaman daftar penjualan">
      <span>
        Menampilkan {dari} sampai {sampai} dari {total} penjualan
      </span>
      {offset > 0 ? (
        <button
          type="button"
          className={styles.paginationLink}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </button>
      ) : null}
      {sampai < total ? (
        <button
          type="button"
          className={styles.paginationLink}
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </button>
      ) : null}
    </nav>
  )
}