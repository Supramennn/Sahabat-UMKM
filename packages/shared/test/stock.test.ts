import { describe, expect, it } from 'vitest'
import {
  MAX_QUANTITY_DECIMALS,
  assertQuantity,
  deriveStockStatus,
  inventoryValueAfterOut,
  recalculateMovingAverage,
  roundRupiah,
} from '../src/stock.ts'

/**
 * PRD 7 dan A-06: rata-rata bergerak per produk, dihitung ulang pada penerimaan,
 * retur, dan koreksi harga. Ini fungsi murni, jadi tidak butuh database.
 */

describe('pembulatan rupiah (KEPUTUSAN-TEKNIS bagian 3)', () => {
  it('membulatkan setengah ke atas', () => {
    expect(roundRupiah(1250.4)).toBe(1250)
    expect(roundRupiah(1250.5)).toBe(1251)
    expect(roundRupiah(1251.5)).toBe(1252)
  })

  it('membulatkan ke arah nol untuk nilai negatif, supaya penyesuaian turun tidak mengimbangi lebih dari seharusnya', () => {
    expect(roundRupiah(-1250.5)).toBe(-1251)
    expect(roundRupiah(-1250.4)).toBe(-1250)
  })

  it('menolak nilai yang bukan angka', () => {
    expect(() => roundRupiah(Number.NaN)).toThrow(RangeError)
    expect(() => roundRupiah(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('presisi jumlah (PRD 6.2)', () => {
  it('menerima jumlah bulat dan jumlah timbangan sampai empat angka desimal', () => {
    expect(assertQuantity(12)).toBe(12)
    expect(assertQuantity(1.5)).toBe(1.5)
    expect(assertQuantity(0.125)).toBe(0.125)
    expect(assertQuantity(10 ** 6 + 0.0001)).toBe(10 ** 6 + 0.0001)
  })

  it('menolak jumlah nol dan negatif', () => {
    expect(() => assertQuantity(0)).toThrow(RangeError)
    expect(() => assertQuantity(-1)).toThrow(RangeError)
  })

  it('menolak presisi di luar yang bisa disimpan, bukan memotongnya diam-diam', () => {
    // Pemotongan diam-diam akan membuat selisih opname muncul tanpa penjelasan.
    expect(() => assertQuantity(1.234567)).toThrow(RangeError)
    expect(() => assertQuantity(1 + 10 ** -MAX_QUANTITY_DECIMALS / 2)).toThrow(RangeError)
  })
})

describe('rata-rata bergerak (PRD 7, A-06)', () => {
  it('menghitung rata-rata tertimbang saat harga beli berbeda', () => {
    const result = recalculateMovingAverage({
      quantityBefore: 10,
      averageCostBefore: 10_000,
      quantityIn: 10,
      unitCostIn: 20_000,
    })

    expect(result.averageCost).toBe(15_000)
    expect(result.inventoryValue).toBe(300_000)
  })

  it('memakai harga penerimaan berikutnya saat saldo habis', () => {    const result = recalculateMovingAverage({
      quantityBefore: 0,
      averageCostBefore: 50_000,
      quantityIn: 4,
      unitCostIn: 12_500,
    })

    // Rata-rata lama tidak ikut dihitung, karena tidak ada barang lama yang ditimbang.
    expect(result.averageCost).toBe(12_500)
    expect(result.inventoryValue).toBe(50_000)
  })

  it('menahan empat angka desimal untuk satuan pecahan', () => {
    const result = recalculateMovingAverage({
      quantityBefore: 1,
      averageCostBefore: 10_000,
      quantityIn: 2,
      unitCostIn: 10_000,
    })

    // Tiga barang dengan total 30.000 menghasilkan 10.000 per satuan.
    expect(result.averageCost).toBe(10_000)

    const pecahan = recalculateMovingAverage({
      quantityBefore: 1,
      averageCostBefore: 10_000,
      quantityIn: 2,
      unitCostIn: 11_000,
    })
    expect(pecahan.averageCost).toBeCloseTo(10_666.6667, 4)
  })

  it('menolak jumlah masuk yang bukan positif', () => {
    expect(() =>
      recalculateMovingAverage({
        quantityBefore: 5,
        averageCostBefore: 10_000,
        quantityIn: 0,
        unitCostIn: 10_000,
      }),
    ).toThrow(RangeError)
  })
})

describe('nilai persediaan setelah barang keluar (PRD 7)', () => {
  it('menjumlahkan sisa dengan rata-rata yang berlaku', () => {
    expect(inventoryValueAfterOut(6, 15_000)).toBe(90_000)
  })

  it('membulatkan ke rupiah penuh pada nilai akhir', () => {
    expect(inventoryValueAfterOut(3, 3333.5)).toBe(10_001)
  })

  it('tidak pernah bernilai negatif walau dipanggil dengan saldo negatif', () => {
    expect(inventoryValueAfterOut(-2, 10_000)).toBe(0)
  })
})

describe('status turunan stok (B-08)', () => {
  it('menyebut habis saat saldo nol', () => {
    expect(deriveStockStatus(0, 5)).toBe('habis')
    expect(deriveStockStatus(0, null)).toBe('habis')
  })

  it('menyebut stok rendah saat saldo menyentuh batas minimum', () => {
    expect(deriveStockStatus(5, 5)).toBe('stok_rendah')
    expect(deriveStockStatus(4, 5)).toBe('stok_rendah')
  })

  it('menyebut normal saat saldo di atas batas minimum', () => {
    expect(deriveStockStatus(6, 5)).toBe('normal')
    expect(deriveStockStatus(1, null)).toBe('normal')
  })
})
