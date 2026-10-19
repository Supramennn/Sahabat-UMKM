import { parseCsv, type ParsedRow, type RowProblem } from './products-csv.ts'

/**
 * Baris supplier untuk impor CSV atau XLSX (PRD 6.8).
 *
 * Hanya nama yang wajib. Sisanya opsional karena daftar supplier lama sering
 * datang tidak lengkap, dan menolak baris hanya karena alamatnya kosong akan
 * membuat impor pertama gagal tanpa alasan yang bisa diperbaiki pengguna.
 */

export const requiredSupplierHeaders = ['nama'] as const

const COLUMN_ALIASES: Record<string, string> = {
  nama: 'nama',
  'nama supplier': 'nama',
  supplier: 'nama',
  kontak: 'kontak',
  'nama kontak': 'kontak',
  contact: 'kontak',
  telepon: 'telepon',
  'no telepon': 'telepon',
  'nomor telepon': 'telepon',
  hp: 'telepon',
  whatsapp: 'telepon',
  phone: 'telepon',
  email: 'email',
  alamat: 'alamat',
  address: 'alamat',
  termin: 'termin',
  'termin hari': 'termin',
  'tempo hari': 'termin',
  tempo: 'termin',
  catatan: 'catatan',
  keterangan: 'catatan',
  note: 'catatan',
}

export function normalizeSupplierHeader(header: string): string {
  const cleaned = header
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return COLUMN_ALIASES[cleaned] ?? cleaned.replace(/\s+/g, '_')
}

export function parseSupplierCsv(content: string) {
  return parseCsv(content, normalizeSupplierHeader)
}

export function missingSupplierHeaders(headers: string[]): string[] {
  const ada = new Set(headers)
  return requiredSupplierHeaders.filter((header) => !ada.has(header))
}

export interface ValidSupplierRow {
  rowNumber: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  paymentTermDays: number | null
  note: string | null
}

export interface SupplierValidationResult {
  valid: ValidSupplierRow[]
  problems: RowProblem[]
}

export function validateSupplierRows(rows: ParsedRow[]): SupplierValidationResult {
  const valid: ValidSupplierRow[] = []
  const problems: RowProblem[] = []
  const seen = new Map<string, number>()

  for (const row of rows) {
    const name = (row.values.nama ?? '').trim()

    if (name.length < 2) {
      problems.push({
        rowNumber: row.rowNumber,
        message: 'Nama supplier minimal 2 karakter.',
      })
      continue
    }

    if (name.length > 120) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Nama supplier "${name}" lebih dari 120 karakter.`,
      })
      continue
    }

    const lower = name.toLowerCase()
    const previousRow = seen.get(lower)
    if (previousRow !== undefined) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Supplier "${name}" sudah ada di baris ${previousRow}.`,
      })
      continue
    }
    seen.set(lower, row.rowNumber)

    const email = (row.values.email ?? '').trim().toLowerCase()
    if (email.length > 254) {
      problems.push({ rowNumber: row.rowNumber, message: `Email "${email}" lebih dari 254 karakter.` })
      continue
    }
    if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      problems.push({
        rowNumber: row.rowNumber,
        message: `Email "${row.values.email}" formatnya tidak valid.`,
      })
      continue
    }

    const contactName = (row.values.kontak ?? '').trim()
    if (contactName.length > 120) {
      problems.push({ rowNumber: row.rowNumber, message: 'Nama kontak lebih dari 120 karakter.' })
      continue
    }

    const phone = (row.values.telepon ?? '').trim()
    if (phone.length > 40) {
      problems.push({ rowNumber: row.rowNumber, message: 'Telepon lebih dari 40 karakter.' })
      continue
    }

    const address = (row.values.alamat ?? '').trim()
    if (address.length > 300) {
      problems.push({ rowNumber: row.rowNumber, message: 'Alamat lebih dari 300 karakter.' })
      continue
    }

    const note = (row.values.catatan ?? '').trim()
    if (note.length > 500) {
      problems.push({ rowNumber: row.rowNumber, message: 'Catatan lebih dari 500 karakter.' })
      continue
    }

    const terminRaw = (row.values.termin ?? '').trim()
    let paymentTermDays: number | null = null
    if (terminRaw !== '') {
      const digits = terminRaw.replace(/\s*hari$/i, '').trim()
      if (!/^\d+$/.test(digits)) {
        problems.push({
          rowNumber: row.rowNumber,
          message: `Termin "${terminRaw}" bukan jumlah hari yang valid. Tulis angkanya saja, misalnya 30.`,
        })
        continue
      }
      const value = Number(digits)
      if (value < 1 || value > 365) {
        problems.push({
          rowNumber: row.rowNumber,
          message: `Termin ${terminRaw} di luar rentang 1 sampai 365 hari.`,
        })
        continue
      }
      paymentTermDays = value
    }

    valid.push({
      rowNumber: row.rowNumber,
      name,
      contactName: contactName || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      paymentTermDays,
      note: note || null,
    })
  }

  return { valid, problems }
}
