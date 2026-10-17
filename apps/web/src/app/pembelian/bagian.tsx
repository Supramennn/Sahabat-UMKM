'use client'

import { formatRupiah } from '@sahabat/shared'
import { cx } from '../../lib/cx'

/**
 * Bagian yang dipakai beberapa halaman pembelian. Berada di berkas sendiri karena
 * berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

/**
 * Status PO ditulis sebagai teks dan warna sekaligus. Warna saja tidak cukup untuk
 * pengguna dengan penglihatan warna terbatas dan dalam mode kontras paksa (PRD 10).
 */
const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'

export function badgeFor(status: string): string {
  if (status === 'disetujui' || status === 'diterima' || status === 'ditutup') {
    return cx(BADGE, 'border-success text-success')
  }
  if (status === 'diajukan' || status === 'diterima_sebagian') {
    return cx(BADGE, 'border-warning text-warning')
  }
  if (status === 'ditolak' || status === 'dibatalkan') {
    return cx(BADGE, 'border-danger text-danger')
  }
  return cx(BADGE, 'border-border-strong text-text-secondary')
}

/**
 * Format rupiah PRD 10: Rp1.250.000 tanpa spasi setelah Rp.
 *
 * Langsung memakai formatter yang sama dengan modul lain, supaya dua tampilan
 * tidak bisa menampilkan nominal yang berbeda untuk angka yang sama.
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

export interface BarisUsulan {
  productId: string
  quantity: string
  unitPrice: string
  discountAmount: string
}

/**
 * Usulan dari daftar stok rendah (PRD 6.3) dikirim sebagai pasangan id dan jumlah
 * yang dipisahkan tanda titik koma, misalnya `12:10;15:4`.
 *
 * Bentuk yang salah diabaikan satu per satu, bukan membuat halaman gagal dibuka:
 * dokumen ini dibuat dari daftar yang bisa jadi berbeda bila barangnya sudah
 * berubah statusnya.
 */
export function parseUsulan(raw: string): BarisUsulan[] {
  return raw
    .split(';')
    .map((segmen) => segmen.trim())
    .filter((segmen) => segmen !== '')
    .map((segmen) => {
      const [productId = '', quantity = '1'] = segmen.split(':')
      return {
        productId: productId.trim(),
        quantity: quantity.trim() === '' ? '1' : quantity.trim(),
        unitPrice: '',
        discountAmount: '',
      }
    })
    .filter((item) => item.productId !== '')
}
