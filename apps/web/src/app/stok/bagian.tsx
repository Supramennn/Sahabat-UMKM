'use client'

import styles from './stok.module.css'

/**
 * Bagian yang dipakai beberapa halaman modul stok. Berada di berkas sendiri
 * karena berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

/**
 * Jumlah barang ditampilkan dengan pemisah ribuan dan maksimal empat angka desimal.
 * Format ini bukan formatNumber dari packages/shared, karena jumlah barang boleh
 * pecahan (misal 1,5 kg) sementara format itu khusus bilangan bulat.
 */
export function formatQty(value: number): string {
  const bulat = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
  const [bagianBulat, bagianDesimal] = bulat.split('.')
  const denganPemisah = (bagianBulat ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return bagianDesimal ? `${denganPemisah},${bagianDesimal}` : denganPemisah
}

/**
 * Status stok selalu ditulis sebagai teks dan simbol, bukan hanya warna, supaya
 * tetap terbaca pada mode kontras paksa (PRD 10). Tipe modul CSS memperlakukan
 * setiap kunci sebagai opsional, jadi nilai kosong dipakai sebagai jaring pengaman
 * dan bukan sebagai sumber gaya.
 */
export function badgeClass(status: string): string {
  if (status === 'habis') return styles.badgeEmpty ?? ''
  if (status === 'stok_rendah') return styles.badgeLow ?? ''
  return styles.badgeNormal ?? ''
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
    <nav className={styles.pagination} aria-label="Halaman daftar">
      <span>
        Menampilkan {dari} sampai {sampai} dari {total} data
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
