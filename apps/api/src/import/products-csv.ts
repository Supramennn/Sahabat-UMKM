import { createHash } from 'node:crypto'
import { z } from 'zod'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'
import { unitCodes } from '../stock/schemas.ts'

/**
 * Impor produk dari CSV (PRD 6.8 dan skenario 1 PRD 3).
 *
 * Aturan yang dipegang:
 *
 * 1. Pratinjau lebih dulu. Berkas divalidasi dan dilaporkan per baris sebelum
 *    ada yang disimpan, supaya pengguna tahu baris mana yang bermasalah.
 * 2. Impor berjalan penuh atau tidak sama sekali. PRD 6.8 mendapati hal ini.
 * 3. Batas paket diperiksa di server. A-01: pesan harus menyebut angka batas dan
 *    cara menaikkan paket, bukan hanya menolak.
 * 4. Kunci idempotency disimpan, jadi berkas yang terkirim dua kali tidak membuat
 *    produk ganda (PRD 9).
 *
 * Pemisahan kolom dan desimal dilakukan manual, bukan pustaka, supaya formatnya
 * ditebak: berkas yang dibuat di ponsel dan yang dibuat di Excel bisa dibaca
 * keduanya.
 */

const REQUIRED_HEADERS = ['sku', 'nama', 'satuan'] as const

const COLUMN_ALIASES: Record<string, string> = {
  sku: 'sku',
  kode: 'sku',
  nama: 'nama',
  'nama barang': 'nama',
  produk: 'nama',
  kategori: 'kategori',
  satuan: 'satuan',
  unit: 'satuan',
  'harga beli': 'hargaBeli',
  'harga_acuan': 'hargaBeli',
  'harga jual': 'hargaJual',
  'stok minimum': 'stokMinimum',
  'stok awal': 'stokAwal',
}

export interface ParsedRow {
  rowNumber: number
  values: Record<string, string>
}

export interface CsvParseResult {
  headers: string[]
  rows: ParsedRow[]
  /** Baris yang tidak bisa dibaca sama sekali, misalnya jumlah kolom tidak sama. */
  problems: Array<{ rowNumber: number; message: string }>
}

/**
 * CSV dengan tanda kutip ganda, pemisah koma atau titik koma, dan baris baru
 * Windows atau Unix. Parser-nya ditulis sendiri supaya tidak ada ketergantungan
 * baru hanya untuk memecah teks yang formatnya sederhana ini.
 */
export function parseCsv(content: string): CsvParseResult {
  // BOM sering muncul dari ekspor Excel dan akan menempel pada nama kolom pertama.
  const text = content.replace(/^\uFEFF/, '')

  const rows: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',' || char === ';') {
      record.push(field)
      field = ''
      continue
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1
      }
      record.push(field)
      field = ''
      // Baris kosong di tengah berkas tidak dihitung sebagai baris data.
      if (record.some((value) => value.trim() !== '')) {
        rows.push(record)
      }
      record = []
      continue
    }

    field += char
  }

  if (field !== '' || record.length > 0) {
    record.push(field)
    if (record.some((value) => value.trim() !== '')) {
      rows.push(record)
    }
  }

  const [headerRow, ...dataRows] = rows
  if (!headerRow) {
    return { headers: [], rows: [], problems: [{ rowNumber: 1, message: 'Berkas kosong.' }] }
  }

  const headers = headerRow.map((header) => normalizeHeader(header))
  const problems: CsvParseResult['problems'] = []
  const parsed: ParsedRow[] = []

  dataRows.forEach((dataRow, index) => {
    const rowNumber = index + 2

    if (dataRow.length !== headers.length) {
      problems.push({
        rowNumber,
        message: `Jumlah kolom tidak sama dengan header: punya ${dataRow.length}, header punya ${headers.length}.`,
      })
      return
    }

    const values: Record<string, string> = {}
    headers.forEach((header, columnIndex) => {
      values[header] = (dataRow[columnIndex] ?? '').trim()
    })
    parsed.push({ rowNumber, values })
  })

  return { headers, rows: parsed, problems }
}

function normalizeHeader(header: string): string {
  const cleaned = header
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return COLUMN_ALIASES[cleaned] ?? cleaned.replace(/\s+/g, '_')
}

export interface ValidatedRow {
  rowNumber: number
  sku: string
  name: string
  unitCode: string
  categoryName: string | null
  purchasePrice: number | null
  sellingPrice: number | null
  minStock: number | null
  openingQuantity: number | null
}

export interface RowProblem {
  rowNumber: number
  message: string
}

export interface ValidationResult {
  valid: ValidatedRow[]
  problems: RowProblem[]
  /** SKU yang muncul lebih dari sekali di berkas yang sama. */
  duplicateSkus: string[]
}

export function validateProductRows(rows: ParsedRow[]): ValidationResult {
  const valid: ValidatedRow[] = []
  const problems: RowProblem[] = []
  const seen = new Map<string, number>()
  const duplicates = new Set<string>()

  for (const row of rows) {
    const sku = row.values.sku ?? ''
    const name = row.values.nama ?? ''
    const unitCode = (row.values.satuan ?? '').toLowerCase()

    if (sku === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'SKU kosong.' })
      continue
    }

    if (sku.length > 64) {
      problems.push({ rowNumber: row.rowNumber, message: 'SKU lebih dari 64 karakter.' })
      continue
    }

    if (name.length < 2) {
      problems.push({
        rowNumber: row.rowNumber,
        message: 'Nama minimal 2 karakter. Baris ini dilewati, bukan disimpan sebagian.',
      })
      continue
    }

    const unit = unitCodes.find((item) => item === unitCode)
    if (!unit) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Satuan "${row.values.satuan ?? ''}" tidak dikenal. Pilihan: ${unitCodes.join(', ')}.`,
      })
      continue
    }

    const previousRow = seen.get(sku.toLowerCase())
    if (previousRow !== undefined) {
      duplicates.add(sku)
      problems.push({
        rowNumber: row.rowNumber,
        message: `SKU "${sku}" sudah dipakai di baris ${previousRow}.`,
      })
      continue
    }
    seen.set(sku.toLowerCase(), row.rowNumber)

    const purchasePrice = parseRupiah(row.values.harga_beli ?? row.values.hargaBeli)
    const sellingPrice = parseRupiah(row.values.harga_jual ?? row.values.hargaJual)
    const minStock = parseQuantity(row.values.stok_minimum ?? row.values.stokMinimum)
    const openingQuantity = parseQuantity(row.values.stok_awal ?? row.values.stokAwal)

    if (row.values.harga_beli && purchasePrice === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Harga beli "${row.values.harga_beli}" bukan angka rupiah yang bisa dibaca.`,
      })
      continue
    }
    if (row.values.harga_jual && sellingPrice === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Harga jual "${row.values.harga_jual}" bukan angka rupiah yang bisa dibaca.`,
      })
      continue
    }
    if ((row.values.stok_minimum ?? row.values.stokMinimum) && minStock === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Stok minimum "${row.values.stok_minimum ?? row.values.stokMinimum}" bukan jumlah yang valid.`,
      })
      continue
    }
    if ((row.values.stok_awal ?? row.values.stokAwal) && openingQuantity === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Stok awal "${row.values.stok_awal ?? row.values.stokAwal}" bukan jumlah yang valid.`,
      })
      continue
    }

    valid.push({
      rowNumber: row.rowNumber,
      sku,
      name,
      unitCode: unit,
      categoryName: row.values.kategori?.trim() || null,
      purchasePrice,
      sellingPrice,
      minStock,
      openingQuantity,
    })
  }

  return { valid, problems, duplicateSkus: [...duplicates] }
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
  if (!Number.isFinite(value) || value < 0) {
    return null
  }
  const scaled = value * 10 ** MAX_QUANTITY_DECIMALS
  return Math.abs(scaled - Math.round(scaled)) > 1e-6 ? null : value
}

export function missingHeaders(headers: string[]): string[] {
  const ada = new Set(headers)
  return REQUIRED_HEADERS.filter((header) => !ada.has(header))
}

/**
 * Hash isi berkas. Kunci idempotency menolak kunci yang sama dengan badan berbeda,
 * jadi hash ini yang dipakai supaya berkas yang sama tidak diimpor dua kali
 * (PRD 6.8).
 */
export function hashImportContent(content: string): string {
  return createHash('sha256').update(content.replace(/^\uFEFF/, ''), 'utf8').digest('hex')
}

export const importPreviewSchema = z.object({
  content: z.string().min(1, 'Berkas kosong.').max(5_000_000, 'Berkas terlalu besar. Batasnya 5 MB.'),
  idempotencyKey: z.string().trim().min(8).max(120),
})
