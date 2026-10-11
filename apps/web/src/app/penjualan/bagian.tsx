'use client'

import { formatRupiah } from '@sahabat/shared'
import styles from './penjualan.module.css'

/**
 * Bagian yang dipakai beberapa halaman penjualan.
 */

export function rupiah(amount: number): string {
  return formatRupiah(amount)
}

export function formatQty(value: number): string {
  const bulat = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
  const [bagianBulat, bagianDesimal] = bulat.split('.')
  const denganPemisah = (bagianBulat ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return bagianDesimal ? `${denganPemisah},${bagianDesimal}` : denganPemisah
}

export function badgeFor(status: string): string {
  if (status === 'active') {
    return `${styles.badge} ${styles.badgeOk}`
  }
  if (status === 'cancelled') {
    return `${styles.badge} ${styles.badgeDanger}`
  }
  return `${styles.badge} ${styles.badgeNeutral}`
}

export function statusLabel(status: string): string {
  if (status === 'active') return 'Aktif'
  if (status === 'cancelled') return 'Dibatalkan'
  return status
}

export function kunciIdempotensi(prefix: string): string {
  const acak = Math.random().toString(36).slice(2)
  return `${prefix}-${Date.now().toString(36)}-${acak}`
}

export function parseJumlah(text: string): number | null {
  const bersih = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(bersih)) return null
  const nilai = Number(bersih)
  if (!Number.isFinite(nilai) || nilai <= 0) return null
  return nilai
}