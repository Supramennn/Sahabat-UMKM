import { Workbook } from 'exceljs'

/**
 * Pembaca XLSX untuk impor (PRD 6.8 menyebut CSV atau XLSX).
 *
 * Berkas XLSX berupa zip berisi XML. Pustaka exceljs dipakai untuk membacanya,
 * karena menuliskannya sendiri berarti menangani zip dan XML di dua tempat, dan
 * satu kesalahan di sana menghasilkan berkas yang salah tanpa pesan galat.
 *
 * Dua hal yang dijaga di sini:
 *
 * 1. Hanya lembar pertama yang dipakai. Satu templat impor punya satu tabel, dan
 *    menggabungkan beberapa lembar tanpa aturan yang jelas akan menyimpan baris
 *    yang tidak pernah dilihat pengguna.
 * 2. Sel kosong, formula, dan sel gabungan jadi teks kosong. Formula yang belum
 *    dihitung sering muncul sebagai hasil kosong saat berkas dibaca, dan itu
 *    akan hilang tanpa penjelasan kalau tidak disebut di laporan baris.
 */

const MAX_ROWS = 20_000

export interface SheetRow {
  rowNumber: number
  values: string[]
}

export interface SheetRead {
  headers: string[]
  rows: SheetRow[]
  problems: Array<{ rowNumber: number; message: string }>
}

export async function readXlsx(data: Buffer): Promise<SheetRead> {
  const workbook = new Workbook()

  try {
    await workbook.xlsx.load(data as unknown as ArrayBuffer)
  } catch (error) {
    throw new Error(`Berkas XLSX tidak bisa dibaca: ${(error as Error).message}`)
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) {
    return {
      headers: [],
      rows: [],
      problems: [{ rowNumber: 1, message: 'Berkas tidak punya lembar data.' }],
    }
  }

  const problems: SheetRead['problems'] = []
  const semua: string[][] = []

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (semua.length > MAX_ROWS) return

    const jumlahKolom = Math.max(row.cellCount, 1)
    const values: string[] = []

    for (let kolom = 1; kolom <= jumlahKolom; kolom += 1) {
      values.push(selToText(row.getCell(kolom)))
    }

    // Baris yang seluruhnya kosong di tengah berkas diabaikan, sama seperti pada
    // pembaca CSV.
    if (values.every((value) => value.trim() === '')) return

    semua.push(values)
    void rowNumber
  })

  if (semua.length > MAX_ROWS) {
    problems.push({
      rowNumber: MAX_ROWS + 2,
      message: `Berkas melebihi ${MAX_ROWS} baris. Pecah berkasnya menjadi beberapa bagian.`,
    })
  }

  const [headerRow, ...dataRows] = semua
  if (!headerRow) {
    return { headers: [], rows: [], problems: [{ rowNumber: 1, message: 'Berkas kosong.' }] }
  }

  const headers = headerRow.map((value) => value.trim())

  return {
    headers,
    rows: dataRows.map((values, index) => ({ rowNumber: index + 2, values })),
    problems,
  }
}

function selToText(cell: { value: unknown; text?: string }): string {
  const nilai = cell.value

  if (nilai === null || nilai === undefined) return ''

  if (typeof nilai === 'object') {
    // Rumus: yang dipakai adalah hasil hitungnya, bukan teks rumusnya.
    const hasil = nilai as { result?: unknown; text?: string; richText?: Array<{ text: string }> }
    if (hasil.result !== undefined && hasil.result !== null) {
      return String(hasil.result)
    }
    if (Array.isArray(hasil.richText)) {
      return hasil.richText.map((bagian) => bagian.text).join('')
    }
    if (hasil.text) return hasil.text
    if (nilai instanceof Date) return nilai.toISOString().slice(0, 10)
    return ''
  }

  if (typeof nilai === 'boolean') return nilai ? 'Ya' : 'Tidak'
  return String(nilai)
}