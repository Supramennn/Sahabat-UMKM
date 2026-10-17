import { describe, expect, it } from 'vitest'
import { badgeFor, formatQty, rupiah } from '../src/app/penjualan/bagian'

/**
 * Bagian yang dipakai bersama di modul penjualan.
 *
 * Fungsi-fungsi ini menentukan angka dan kalimat yang dilihat pengguna setiap hari,
 * jadi diuji tanpa membuka peramban: format rupiah dan jumlah barang, serta kelas
 * status penjualan.
 */

describe('format rupiah (PRD 10)', () => {
  it('memberi pemisah titik di ribuan tanpa spasi setelah Rp', () => {
    expect(rupiah(0)).toBe('Rp0')
    expect(rupiah(90_000)).toBe('Rp90.000')
    expect(rupiah(-15_000)).toBe('-Rp15.000')
  })
})

describe('format jumlah barang', () => {
  it('memakai koma sebagai pemisah desimal dan titik sebagai pemisah ribuan', () => {
    expect(formatQty(3)).toBe('3')
    expect(formatQty(12_000)).toBe('12.000')
    expect(formatQty(1.5)).toBe('1,5')
  })
})

describe('status penjualan ditulis sebagai teks dan warna', () => {
  it('membedakan penjualan selesai dan dibatalkan', () => {
    expect(badgeFor('selesai')).not.toBe(badgeFor('dibatalkan'))
    expect(badgeFor('selesai')).toContain('rounded-badge')
    expect(badgeFor('selesai')).toContain('border-success')
    expect(badgeFor('dibatalkan')).toContain('border-danger')
  })
})