'use client'

import styles from './pembelian.module.css'

/**
 * Bagian yang dipakai beberapa halaman pembelian. Berada di berkas sendiri karena
 * berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

/**
 * Status PO ditulis sebagai teks dan warna sekaligus. Warna saja tidak cukup untuk
 * pengguna dengan penglihatan warna terbatas dan dalam mode kontras paksa (PRD 10).
 */
export function badgeFor(status: string): string {
  if (status === 'disetujui' || status === 'diterima' || status === 'ditutup') {
    return `${styles.badge} ${styles.badgeOk}`
  }
  if (status === 'diajukan' || status === 'diterima_sebagian') {
    return `${styles.badge} ${styles.badgePending}`
  }
  if (status === 'ditolak' || status === 'dibatalkan') {
    return `${styles.badge} ${styles.badgeDanger}`
  }
  return `${styles.badge} ${styles.badgeNeutral}`
}

/** Format rupiah PRD 10: Rp1.250.000 tanpa spasi setelah Rp. */
export function rupiah(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${amount < 0 ? '-' : ''}Rp${digits}`
}

/** Jumlah barang boleh pecahan, jadi pemisah desimalnya koma seperti di Indonesia. */
export function formatQty(value: number): string {
  const bulat = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
  const [bagianBulat, bagianDesimal] = bulat.split('.')
  const denganPemisah = (bagianBulat ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return bagianDesimal ? `${denganPemisah},${bagianDesimal}` : denganPemisah
}
