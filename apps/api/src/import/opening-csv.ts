import { parseCsv, parseQuantity, parseRupiah, type ParsedRow, type RowProblem } from './products-csv.ts'

/**
 * Impor saldo awal (PRD 6.8): satu baris berarti satu barang di satu lokasi.
 *
 * Saldo awal punya alur sendiri, bukan kolom di impor barang, karena ia butuh
 * lokasi dan menghasilkan baris ledger stok. Jumlah wajib dan harus lebih besar
 * dari nol. Harga beli opsional dan dipakai sebagai harga pokok saldo awal.
 * Tanggal opsional, supaya saldo awal bisa bertanggal mundur mengikuti buku lama;
 * kalau kosong, tanggal hari ini yang dipakai saat menyimpan.
 */

export const requiredOpeningHeaders = ['sku', 'lokasi', 'jumlah'] as const

const COLUMN_ALIASES: Record<string, string> = {
  sku: 'sku',
  kode: 'sku',
  lokasi: 'lokasi',
  location: 'lokasi',
  gudang: 'lokasi',
  jumlah: 'jumlah',
  qty: 'jumlah',
  kuantitas: 'jumlah',
  quantity: 'jumlah',
  'harga beli': 'harga_beli',
  'harga pokok': 'harga_beli',
  'harga satuan': 'harga_beli',
  harga_beli: 'harga_beli',
  tanggal: 'tanggal',
  date: 'tanggal',
}

export function normalizeOpeningHeader(header: string): string {
  const cleaned = header
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return COLUMN_ALIASES[cleaned] ?? cleaned.replace(/\s+/g, '_')
}

export function parseOpeningCsv(content: string) {
  return parseCsv(content, normalizeOpeningHeader)
}

export function missingOpeningHeaders(headers: string[]): string[] {
  const ada = new Set(headers)
  return requiredOpeningHeaders.filter((header) => !ada.has(header))
}

export interface ValidOpeningRow {
  rowNumber: number
  sku: string
  locationName: string
  quantity: number
  unitCost: number | null
  /** Tanggal YYYY-MM-DD, atau null untuk memakai hari ini saat menyimpan. */
  occurredOn: string | null
}

export interface OpeningValidationResult {
  valid: ValidOpeningRow[]
  problems: RowProblem[]
}

export function validateOpeningRows(rows: ParsedRow[]): OpeningValidationResult {
  const valid: ValidOpeningRow[] = []
  const problems: RowProblem[] = []
  const seen = new Map<string, number>()

  for (const row of rows) {
    const sku = (row.values.sku ?? '').trim()
    const lokasi = (row.values.lokasi ?? '').trim()

    if (sku === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'SKU kosong.' })
      continue
    }

    if (sku.length > 64) {
      problems.push({ rowNumber: row.rowNumber, message: 'SKU lebih dari 64 karakter.' })
      continue
    }

    if (lokasi === '') {
      problems.push({ rowNumber: row.rowNumber, message: 'Lokasi kosong.' })
      continue
    }

    const key = `${sku.toLowerCase()}|${lokasi.toLowerCase()}`
    const previousRow = seen.get(key)
    if (previousRow !== undefined) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Barang ${sku} di ${lokasi} sudah punya baris di baris ${previousRow}. Satu barang hanya boleh muncul sekali per lokasi.`,
      })
      continue
    }
    seen.set(key, row.rowNumber)

    const quantity = parseQuantity(row.values.jumlah)
    if (quantity === null || quantity === 0) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Jumlah "${row.values.jumlah ?? ''}" harus angka lebih besar dari nol dengan maksimal empat angka desimal.`,
      })
      continue
    }

    const unitCost = parseRupiah(row.values.harga_beli)
    if (row.values.harga_beli && unitCost === null) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Harga beli "${row.values.harga_beli}" bukan angka rupiah yang bisa dibaca.`,
      })
      continue
    }

    const tanggal = (row.values.tanggal ?? '').trim()
    if (tanggal !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Tanggal "${tanggal}" bukan format YYYY-MM-DD.`,
      })
      continue
    }

    valid.push({
      rowNumber: row.rowNumber,
      sku,
      locationName: lokasi,
      quantity,
      unitCost,
      occurredOn: tanggal === '' ? null : tanggal,
    })
  }

  return { valid, problems }
}
