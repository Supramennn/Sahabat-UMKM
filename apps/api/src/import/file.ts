import { z } from 'zod'
import { StockError } from '../stock/movements.ts'
import {
  hashImportContent,
  parseCsv,
  type CsvParseResult,
  type ParsedRow,
} from './products-csv.ts'
import { readXlsx, type SheetRead } from './xlsx.ts'

/**
 * Isi berkas impor, CSV maupun XLSX (PRD 6.8).
 *
 * CSV datang sebagai teks dan XLSX sebagai biner. Biner itu tentang peramban tidak
 * bisa dibaca langsung dari JSON, jadi ia dikirim sebagai base64 dengan pola yang
 * sama seperti unggahan foto: data URL, batas ukuran diperiksa sebelum decoding,
 * dan jenis berkas ditentukan dari isinya lewat magic bytes, bukan dari nama yang
 * diketik pengguna.
 *
 * Pembacaan menghasilkan bentuk yang sama untuk kedua format, jadi validasi dan
 * commit tidak perlu tahu asal barisnya dari mana.
 */

export const MAX_IMPORT_FILE_BYTES = 7_000_000

/** Batas baris per impor. Angka yang sama dipakai semua jenis impor. */
export const MAX_IMPORT_ROWS = 20_000

/**
 * Body JSON memuat base64, dan base64 membengkakkan isi sekitar 4/3. Batas badan
 * permintaan dihitung dari situ supaya berkas yang lolos skema pasti lolos juga
 * di pembaca badan permintaan Fastify, bukan ditolak dengan pesan yang berbeda.
 */
export const IMPORT_BODY_LIMIT = Math.ceil(MAX_IMPORT_FILE_BYTES * 1.4) + 32_768

export const importFileSchema = z
  .object({
    content: z
      .string()
      .min(1, 'Berkas kosong.')
      .max(5_000_000, 'Berkas teks lebih dari 5 MB. Pecah berkasnya menjadi beberapa bagian.')
      .optional(),
    contentBase64: z
      .string()
      .min(1, 'Berkas kosong.')
      .max(IMPORT_BODY_LIMIT, 'Berkas XLSX lebih dari 7 MB. Pecah berkasnya menjadi beberapa bagian.')
      .optional(),
    fileName: z.string().trim().max(200).nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .refine((value) => (value.content ? 1 : 0) + (value.contentBase64 ? 1 : 0) === 1, {
    message: 'Kirim isi berkas sebagai teks CSV atau XLSX, salah satu saja.',
  })

export type ImportFileInput = z.infer<typeof importFileSchema>

export interface ImportFileRead {
  format: 'csv' | 'xlsx'
  contentHash: string
  parsed: CsvParseResult
}

export async function readImportFile(
  input: ImportFileInput,
  normalize: (header: string) => string,
): Promise<ImportFileRead> {
  if (input.contentBase64) {
    return readXlsxContents(input.contentBase64, normalize)
  }

  const content = input.content!
  return {
    format: 'csv',
    contentHash: hashImportContent(content),
    parsed: parseCsv(content, normalize),
  }
}

async function readXlsxContents(
  base64: string,
  normalize: (header: string) => string,
): Promise<ImportFileRead> {
  const buffer = Buffer.from(base64, 'base64')

  if (buffer.length === 0) {
    throw new StockError('berkas_kosong', 'Berkas kosong.', 400)
  }

  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new StockError(
      'berkas_terlalu_besar',
      'Berkas XLSX lebih dari 7 MB. Pecah berkasnya menjadi beberapa bagian.',
      400,
    )
  }

  // XLSX adalah arsip zip. Penanda PK menyingkirkan berkas jenis lain yang
  // namanya diganti .xlsx sebelum biaya membaca spreadsheet dikeluarkan.
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new StockError(
      'berkas_bukan_xlsx',
      'Berkas yang dikirim bukan berkas XLSX. Simpan ulang dari Excel sebagai .xlsx, atau impor sebagai CSV.',
      400,
    )
  }

  let sheet: SheetRead
  try {
    sheet = await readXlsx(buffer)
  } catch (error) {
    throw new StockError('berkas_tidak_bisa_dibaca', (error as Error).message, 400)
  }

  return {
    format: 'xlsx',
    contentHash: hashImportContent(buffer),
    parsed: sheetToParsed(sheet, normalize),
  }
}

/** Menyusun hasil baca XLSX menjadi bentuk yang sama dengan hasil parse CSV. */
export function sheetToParsed(
  sheet: SheetRead,
  normalize: (header: string) => string,
): CsvParseResult {
  if (sheet.headers.length === 0) {
    return { headers: [], rows: [], problems: [{ rowNumber: 1, message: 'Berkas kosong.' }] }
  }

  const headers = sheet.headers.map(normalize)
  const problems: CsvParseResult['problems'] = [...sheet.problems]
  const rows: ParsedRow[] = []

  for (const row of sheet.rows) {
    // Excel memangkas sel kosong di ujung baris, jadi baris yang lebih pendek dari
    // header adalah hal biasa dan bukan kesalahan pengguna. Baris yang lebih panjang
    // tetap dilaporkan karena itu tanda kolomnya bergeser.
    if (row.values.length > headers.length) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Jumlah kolom tidak sama dengan header: punya ${row.values.length}, header punya ${headers.length}.`,
      })
      continue
    }

    const values: Record<string, string> = {}
    headers.forEach((header, index) => {
      values[header] = (row.values[index] ?? '').trim()
    })
    rows.push({ rowNumber: row.rowNumber, values })
  }

  return { headers, rows, problems }
}

/** Kolom "stok awal" pindah ke impor saldo awal. Pesannya menunjuk ke sana. */
export function hasOpeningBalanceColumn(headers: string[]): boolean {
  return headers.some((header) => header === 'stok_awal' || header === 'stokAwal')
}
