import { createHash } from 'node:crypto'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'
import { parseCsv, type ParsedRow, type RowProblem } from './products-csv.ts'

/**
 * Impor penjualan dari CSV (PRD 6.4 butir terakhir, PRD 6.8).
 *
 * Satu baris berarti satu penjualan dengan satu barang. Kasir dan aplikasi kasir
 * exporting seperti itu, dan satu baris per barang membuat pesan galat jauh lebih
 * mudah ditunjuk: pengguna tahu baris nomor berapa yang salah, bukan menebak dari
 * nomor nota.
 *
 * Baris berkasnya berulang dari file yang sama, tapi setiap baris tetap menghasilkan
 * penjualan dan baris ledger sendiri. Itu bukan duplikat: satu file penjualan
 * yang sah berisi banyak transaksi.
 */

const REQUIRED_HEADERS = ['tanggal', 'lokasi', 'sku', 'jumlah', 'harga_jual'] as const

const COLUMN_ALIASES: Record<string, string> = {
  tanggal: 'tanggal',
  date: 'tanggal',
  'tgl jual': 'tanggal',
  lokasi: 'lokasi',
  location: 'lokasi',
  pelanggan: 'pelanggan',
  customer: 'pelanggan',
  'nama pelanggan': 'pelanggan',
  metode: 'metode_pembayaran',
  'metode pembayaran': 'metode_pembayaran',
  metode_pembayaran: 'metode_pembayaran',
  payment: 'metode_pembayaran',
  sku: 'sku',
  kode: 'sku',
  barang: 'nama_barang',
  'nama barang': 'nama_barang',
  jumlah: 'jumlah',
  qty: 'jumlah',
  quantity: 'jumlah',
  'harga jual': 'harga_jual',
  harga: 'harga_jual',
  price: 'harga_jual',
  diskon: 'diskon',
  discount: 'diskon',
  catatan: 'catatan',
  note: 'catatan',
}

/** Header dinormalisasi dengan aturan yang sama seperti impor produk. */
export function normalizeSalesHeader(header: string): string {
  const cleaned = header
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const mapped = COLUMN_ALIASES[cleaned]
  if (mapped) {
    return mapped
  }
  return cleaned.replace(/\s+/g, '_')
}

export interface SalesParsedResult {
  headers: string[]
  rows: ParsedRow[]
  problems: RowProblem[]
}

/**
 * CSV penjualan memakai parser yang sama dengan impor produk, hanya normalisasi nama
 * kolomnya yang berbeda. Normalisasi dijalankan sekali di dalam parser: menjalankannya
 * dua kali akan mengubah "harga jual" jadi "hargaJual" lalu "hargajual", dan tidak
 * ada kolom yang cocok lagi.
 */
export function parseSalesCsv(content: string): SalesParsedResult {
  return parseCsv(content, normalizeSalesHeader)
}

export function missingSalesHeaders(headers: string[]): string[] {
  const ada = new Set(headers)
  return REQUIRED_HEADERS.filter((header) => !ada.has(header))
}

export interface ValidSalesRow {
  rowNumber: number
  soldOn: string
  locationName: string
  customerName: string | null
  paymentMethodLabel: string
  sku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  note: string | null
}

export interface SalesValidationResult {
  valid: ValidSalesRow[]
  problems: RowProblem[]
}

export function validateSalesRows(rows: ParsedRow[]): SalesValidationResult {
  const valid: ValidSalesRow[] = []
  const problems: RowProblem[] = []

  for (const row of rows) {
    const tanggal = (row.values.tanggal ?? '').trim()
    const lokasi = (row.values.lokasi ?? '').trim()
    const sku = (row.values.sku ?? '').trim()
    const metode = (row.values.metode_pembayaran ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Tanggal "${tanggal}" bukan format YYYY-MM-DD.`,
      })
      continue
    }

    if (lokasi === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'Lokasi kosong.' })
      continue
    }

    if (sku === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'SKU kosong.' })
      continue
    }

    if (metode === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'Metode pembayaran kosong.' })
      continue
    }

    const jumlah = parseQuantity(row.values.jumlah)
    if (jumlah === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Jumlah "${row.values.jumlah ?? ''}" bukan jumlah yang valid.`,
      })
      continue
    }

    const hargaJual = parseRupiah(row.values.harga_jual)
    if (hargaJual === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Harga jual "${row.values.harga_jual ?? ''}" bukan angka rupiah yang bisa dibaca.`,
      })
      continue
    }

    const diskon = parseRupiah(row.values.diskon)
    if (row.values.diskon && diskon === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Diskon "${row.values.diskon}" bukan angka rupiah yang bisa dibaca.`,
      })
      continue
    }

    const nilaiDiskon = diskon ?? 0
    const nilaiBaris = Math.round(jumlah * hargaJual)
    if (nilaiDiskon > nilaiBaris) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Diskon Rp${nilaiDiskon.toLocaleString('id-ID')} lebih besar dari nilai barang Rp${nilaiBaris.toLocaleString('id-ID')}.`,
      })
      continue
    }

    valid.push({
      rowNumber: row.rowNumber,
      soldOn: tanggal,
      locationName: lokasi,
      customerName: (row.values.pelanggan ?? '').trim() || null,
      paymentMethodLabel: metode,
      sku,
      quantity: jumlah,
      unitPrice: hargaJual,
      discountAmount: nilaiDiskon,
      note: (row.values.catatan ?? '').trim() || null,
    })
  }

  return { valid, problems }
}

/** Nomor 12.500 dan 12500 berarti dua belas ribu lima ratus. */
function parseRupiah(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') {
    return null
  }
  const cleaned = raw.trim().replace(/rp\s*/i, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null
  }
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

function parseQuantity(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') {
    return null
  }
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null
  }
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  const scaled = value * 10 ** MAX_QUANTITY_DECIMALS
  return Math.abs(scaled - Math.round(scaled)) > 1e-6 ? null : value
}

export function hashSalesImportContent(content: string): string {
  return createHash('sha256').update(content.replace(/^\uFEFF/, ''), 'utf8').digest('hex')
}