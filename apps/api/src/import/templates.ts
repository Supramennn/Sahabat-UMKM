import exceljs from 'exceljs'

// Sama seperti pembaca XLSX: exceljs berbentuk CommonJS, jadi kelasnya diambil dari
// ekspor default.
const { Workbook } = exceljs

/**
 * Template impor (PRD 6.8): "Template yang bisa diunduh tersedia untuk tiap jenis."
 *
 * Template dibuat di server, bukan di peramban, karena berkas XLSX butuh penulis
 * spreadsheet. Header-nya juga dipakai tes untuk memastikan kolom wajib dari
 * validator selalu ada di templat, supaya template dan pembaca berkas tidak bisa
 * berbeda diam-diam.
 */

export const templateKinds = ['produk', 'supplier', 'saldo_awal', 'penjualan'] as const

export type TemplateKind = (typeof templateKinds)[number]

export interface TemplateSpec {
  /** Nama lembar di berkas XLSX, dalam Bahasa Indonesia. */
  sheetName: string
  headers: string[]
  examples: string[][]
}

const specs: Record<TemplateKind, TemplateSpec> = {
  produk: {
    sheetName: 'Impor barang',
    headers: ['sku', 'nama', 'kategori', 'satuan', 'harga beli', 'harga jual', 'stok minimum'],
    examples: [
      ['KOPI-1', 'Kopi bubuk 250 g', 'Minuman', 'pcs', '45000', '60000', '5'],
      ['GULA-1', 'Gula pasir', 'Minuman', 'kg', '16000', '22000', '3'],
    ],
  },
  supplier: {
    sheetName: 'Impor supplier',
    headers: ['nama', 'kontak', 'telepon', 'email', 'alamat', 'termin', 'catatan'],
    examples: [
      ['PT Sumber Kopi', 'Rina', '081234567890', 'rina@sumberkopi.co.id', 'Jl. Merdeka 10, Bandung', '30', ''],
      ['Toko Gula Jaya', 'Budi', '', '', '', '', 'Kirim setiap Senin'],
    ],
  },
  saldo_awal: {
    sheetName: 'Impor saldo awal',
    headers: ['sku', 'lokasi', 'jumlah', 'harga beli', 'tanggal'],
    examples: [
      ['KOPI-1', 'Gudang', '24', '45000', '2026-10-01'],
      ['GULA-1', 'Gudang', '10', '16000', ''],
    ],
  },
  penjualan: {
    sheetName: 'Impor penjualan',
    headers: ['tanggal', 'lokasi', 'pelanggan', 'metode pembayaran', 'sku', 'jumlah', 'harga jual', 'diskon'],
    examples: [
      ['2026-10-02', 'Kios', '', 'Tunai', 'KOPI-1', '2', '60000', ''],
      ['2026-10-02', 'Kios', 'Bu Sari', 'QRIS', 'GULA-1', '1', '22000', '500'],
    ],
  },
}

export function templateCsv(kind: TemplateKind): string {
  const spec = specs[kind]
  const rows = spec.examples.map((row) => row.map(escapeCsv).join(','))
  return [spec.headers.join(','), ...rows].join('\n') + '\n'
}

/**
 * Tanda kutip hanya dipakai kalau isinya memang mengandung pemisah. Tanpa ini,
 * alamat dengan koma akan membelah satu baris jadi dua kolom saat dibuka lagi.
 */
function escapeCsv(value: string): string {
  if (!/[",;\n]/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}

export async function templateXlsx(kind: TemplateKind): Promise<Buffer> {
  const spec = specs[kind]
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet(spec.sheetName)

  sheet.addRow(spec.headers)
  sheet.getRow(1).font = { bold: true }
  for (const example of spec.examples) {
    sheet.addRow(example)
  }

  sheet.columns = spec.headers.map((header) => ({
    width: Math.min(28, Math.max(11, header.length + 3)),
  }))

  const data = await workbook.xlsx.writeBuffer()
  return Buffer.from(data as unknown as ArrayBufferLike)
}
