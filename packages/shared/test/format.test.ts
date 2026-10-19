import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateInTimeZone,
  formatNumber,
  formatQuantity,
  formatRupiah,
  fileDateStamp,
  toDateParts,
} from '../src/format.ts'

describe('format Rupiah PRD 10', () => {
  it('memakai bentuk yang PRD tetapkan, tanpa spasi setelah Rp', () => {
    expect(formatRupiah(1_250_000)).toBe('Rp1.250.000')
  })

  it('tidak pernah menulis pecahan', () => {
    expect(formatRupiah(1500.99)).toBe('Rp1.500')
  })

  it('menulis nilai kecil tanpa titik', () => {
    expect(formatRupiah(0)).toBe('Rp0')
    expect(formatRupiah(7)).toBe('Rp7')
    expect(formatRupiah(999)).toBe('Rp999')
  })

  it('memberi tanda minus di depan Rp untuk nilai negatif', () => {
    expect(formatRupiah(-1_250_000)).toBe('-Rp1.250.000')
  })

  it('kelompokkan ribuan dengan benar sampai miliar', () => {
    expect(formatRupiah(1_000_000_000)).toBe('Rp1.000.000.000')
  })

  it('menolak nominal yang bukan angka', () => {
    expect(() => formatRupiah(Number.NaN)).toThrow(RangeError)
    expect(() => formatRupiah(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('format angka', () => {
  it('kelompokkan ribuan tanpa awalan Rp', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
  })
})

describe('format jumlah barang', () => {
  it('memakai koma sebagai pemisah desimal', () => {
    expect(formatQuantity(2.5)).toBe('2,5')
  })

  it('tidak menulis nol di ujung', () => {
    expect(formatQuantity(Number('1.5000'))).toBe('1,5')
    expect(formatQuantity(Number('0.2500'))).toBe('0,25')
  })

  it('memberi pemisah ribuan dan tanpa desimal untuk angka bulat', () => {
    expect(formatQuantity(1500)).toBe('1.500')
    expect(formatQuantity(0)).toBe('0')
  })

  it('membulatkan sampai empat angka desimal', () => {
    expect(formatQuantity(Number('1.23459'))).toBe('1,2346')
  })

  it('menolak jumlah yang bukan angka', () => {
    expect(() => formatQuantity(Number.NaN)).toThrow(RangeError)
    expect(() => formatQuantity(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('format tanggal PRD 10', () => {
  it('memakai bentuk yang PRD tetapkan', () => {
    expect(formatDate({ year: 2026, month: 10, day: 9 })).toBe('9 Okt 2026')
  })

  it('memakai nama bulan Bahasa Indonesia', () => {
    expect(formatDate({ year: 2026, month: 1, day: 1 })).toBe('1 Jan 2026')
    expect(formatDate({ year: 2026, month: 12, day: 31 })).toBe('31 Des 2026')
  })

  it('menolak bulan di luar rentang', () => {
    expect(() => formatDate({ year: 2026, month: 13, day: 1 })).toThrow(RangeError)
    expect(() => formatDate({ year: 2026, month: 0, day: 1 })).toThrow(RangeError)
  })
})

describe('zona waktu workspace', () => {
  const soreJakarta = new Date('2026-10-09T12:00:00Z')

  it('mengambil tanggal kalender menurut zona waktu', () => {
    expect(toDateParts(soreJakarta, 'Asia/Jakarta')).toEqual({ year: 2026, month: 10, day: 9 })
  })

  it('tidak bergeser sehari pada waktu yang dekat batas hari', () => {
    // 2026-10-09T17:30Z adalah 00:30 tanggal 10 di Jakarta.
    const tengahMalamJakarta = new Date('2026-10-09T17:30:00Z')
    expect(formatDateInTimeZone(tengahMalamJakarta, 'Asia/Jakarta')).toBe('10 Okt 2026')
    // Di UTC masih tanggal 9.
    expect(formatDateInTimeZone(tengahMalamJakarta, 'UTC')).toBe('9 Okt 2026')
  })

  it('membuat stempel berkas tanpa spasi', () => {
    expect(fileDateStamp(new Date('2026-10-09T03:00:00Z'), 'Asia/Jakarta')).toBe('2026-10-09')
  })
})
