/**
 * Perhitungan stok yang dipakai modul stok dan modul lain yang membutuhkannya,
 * termasuk laba kotor nanti. Semuanya fungsi murni tanpa akses database, jadi
 * bisa diuji tanpa PGlite dan tanpa PostgreSQL.
 */

/**
 * Uang disimpan sebagai rupiah penuh tanpa pecahan (KEPUTUSAN-TEKNIS bagian 3).
 * Pembulatan setengah ke atas dilakukan per baris, bukan di akhir perhitungan, dan
 * nilai akhir itulah yang disimpan.
 */
export function roundRupiah(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Nominal tidak valid: ${value}`)
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Kuantitas disimpan sebagai numeric(18,4) supaya barang timbang dan satuan
 * pecahan bisa akurat. Nilai yang lebih dari empat angka desimal ditolak, bukan
 * dipotong diam-diam, karena selisih kecil yang hilang antar penerimaan akan terlihat
 * sebagai selisih stok opname yang tidak bisa dijelaskan.
 */
export const MAX_QUANTITY_DECIMALS = 4

export function assertQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Jumlah tidak valid: ${value}`)
  }
  if (value <= 0) {
    throw new RangeError('Jumlah harus lebih besar dari nol.')
  }

  const scaled = value * 10 ** MAX_QUANTITY_DECIMALS
  // Selisih di bawah setengah satuan terakhir berarti angka punya presisi lebih
  // tinggi dari yang bisa disimpan.
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new RangeError(
      `Jumlah hanya boleh ${MAX_QUANTITY_DECIMALS} angka desimal: ${value}`,
    )
  }

  return value
}

export interface MovingAverageInput {
  /** Saldo sebelum barang masuk, dalam satuan produk. */
  quantityBefore: number
  /** Rata-rata sebelum barang masuk, rupiah penuh per satuan. */
  averageCostBefore: number
  quantityIn: number
  /** Harga beli barang yang masuk, rupiah penuh per satuan. */
  unitCostIn: number
}

export interface MovingAverageResult {
  /** Rata-rata bergerak setelah barang masuk, sampai empat angka desimal. */
  averageCost: number
  /** Nilai persediaan setelah barang masuk, rupiah penuh. */
  inventoryValue: number
}

/**
 * PRD 7 dan A-06: rata-rata bergerak dihitung ulang pada penerimaan barang, retur
 * pembelian, dan koreksi harga beli. Ketika saldo menjadi nol, rata-rata direset
 * ke harga penerimaan berikutnya supaya harga lama tidak terbawa ke periode
 * berikutnya.
 */
export function recalculateMovingAverage(input: MovingAverageInput): MovingAverageResult {
  const quantityBefore = input.quantityBefore
  const quantityIn = input.quantityIn

  if (quantityIn <= 0) {
    throw new RangeError('Jumlah masuk harus lebih besar dari nol.')
  }

  const quantityAfter = quantityBefore + quantityIn

  if (quantityAfter <= 0) {
    // Saldo habis sebelum barang masuk, jadi tidak ada rata-rata lama untuk
    // ditimbang: harga penerimaan berikutnya yang dipakai.
    return { averageCost: roundToQuantityScale(input.unitCostIn), inventoryValue: 0 }
  }

  const totalCost = quantityBefore * input.averageCostBefore + quantityIn * input.unitCostIn

  return {
    averageCost: roundToQuantityScale(totalCost / quantityAfter),
    inventoryValue: roundRupiah(totalCost),
  }
}

/**
 * Nilai persediaan setelah barang keluar. Rata-rata tidak berubah karena barang
 * keluar: yang berkurang adalah jumlahnya.
 */
export function inventoryValueAfterOut(quantityAfter: number, averageCost: number): number {
  return roundRupiah(Math.max(0, quantityAfter) * averageCost)
}

/** Status turunan untuk kartu dan peringatan (B-08). */
export type DerivedStockStatus = 'habis' | 'stok_rendah' | 'normal'

export function deriveStockStatus(quantity: number, minStock: number | null): DerivedStockStatus {
  if (quantity <= 0) {
    return 'habis'
  }
  if (minStock !== null && quantity <= minStock) {
    return 'stok_rendah'
  }
  return 'normal'
}

/** Label status turunan dalam Bahasa Indonesia dengan sapaan netral. */
export const derivedStockStatusLabels: Record<DerivedStockStatus, string> = {
  habis: 'Habis',
  stok_rendah: 'Stok rendah',
  normal: 'Normal',
}

function roundToQuantityScale(value: number): number {
  const scaled = value * 10 ** MAX_QUANTITY_DECIMALS
  return Math.round(scaled) / 10 ** MAX_QUANTITY_DECIMALS
}
