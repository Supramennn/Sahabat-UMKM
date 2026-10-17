import { describe, expect, it } from 'vitest'
import { badgeFor, formatQty, parseUsulan, rupiah } from '../src/app/pembelian/bagian'

/**
 * Bagian yang dipakai bersama di modul pembelian.
 *
 * Fungsi-fungsi ini menentukan angka dan kalimat yang dilihat pengguna setiap
 * hari, jadi diuji tanpa perlu membuka peramban: format rupiah dan jumlah
 * barang, parsing usulan dari daftar stok rendah, dan kelas status.
 */

describe('format rupiah (PRD 10)', () => {
  it('memberi pemisah titik di ribuan tanpa spasi setelah Rp', () => {
    expect(rupiah(0)).toBe('Rp0')
    expect(rupiah(1_000)).toBe('Rp1.000')
    expect(rupiah(1_250_000)).toBe('Rp1.250.000')
    expect(rupiah(-45_000)).toBe('-Rp45.000')
  })

  it('menolak angka yang bukan nominal', () => {
    // Nominal selalu rupiah penuh dari server. Angka aneh lebih baik menggagalkan
    // tampilan daripada menampilkan "RpNaN".
    expect(() => rupiah(Number.NaN)).toThrow(RangeError)
  })
})

describe('format jumlah barang', () => {
  it('memakai koma sebagai pemisah desimal dan titik sebagai pemisah ribuan', () => {
    expect(formatQty(5)).toBe('5')
    expect(formatQty(1_500)).toBe('1.500')
    expect(formatQty(1.5)).toBe('1,5')
    expect(formatQty(0.25)).toBe('0,25')
  })
})

describe('status PO ditulis sebagai teks dan warna', () => {
  it('memberi kelas berbeda untuk status yang berbeda', () => {
    expect(badgeFor('disetujui')).not.toBe(badgeFor('ditolak'))
    expect(badgeFor('draft')).not.toBe(badgeFor('disetujui'))
    expect(badgeFor('disetujui')).toContain('rounded-badge')
    expect(badgeFor('disetujui')).toContain('border-success')
    expect(badgeFor('ditolak')).toContain('border-danger')
  })

  it('menyebut status yang tidak dikenal sebagai netral, bukan sebagai gagal', () => {
    expect(badgeFor('entah')).toContain('border-border-strong')
    expect(badgeFor('entah')).not.toContain('border-danger')
  })
})

describe('usulan dari daftar stok rendah (PRD 6.3)', () => {
  it('membaca beberapa barang sekaligus', () => {
    expect(parseUsulan('12:10;15:4')).toEqual([
      { productId: '12', quantity: '10', unitPrice: '', discountAmount: '' },
      { productId: '15', quantity: '4', unitPrice: '', discountAmount: '' },
    ])
  })

  it('menggunakan jumlah 1 kalau jumlahnya tidak diisi', () => {
    expect(parseUsulan('12')).toEqual([
      { productId: '12', quantity: '1', unitPrice: '', discountAmount: '' },
    ])
    expect(parseUsulan('12:')).toEqual([
      { productId: '12', quantity: '1', unitPrice: '', discountAmount: '' },
    ])
  })

  it('mengabaikan segmen yang tidak punya id barang', () => {
    expect(parseUsulan('')).toEqual([])
    expect(parseUsulan(';;')).toEqual([])
    expect(parseUsulan('12:3;;15:2')).toHaveLength(2)
  })
})