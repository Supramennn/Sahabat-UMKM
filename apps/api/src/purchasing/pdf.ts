import PDFDocument from 'pdfkit'

/**
 * Berkas PDF purchase order (PRD 6.3).
 *
 * Dua hal yang menentukan isi berkas ini:
 *
 * 1. Yang dicetak hanya data yang sudah ada di PO. Tidak ada logo, tidak ada
 *    klaim, tidak ada nomor telepon fabrikasi (AGENTS.md).
 * 2. Huruf yang dipakai PDF bawaan hanya bisa menulis WinAnsi. Nama supplier
 *    atau barang bisa memuat huruf di luar itu, jadi teks dibersihkan lebih
 *    dulu. Tanpa itu, satu nama aneh membuat permintaan gagal seluruhnya.
 */

export interface PdfOrderItem {
  productName: string
  sku: string
  unitCode: string
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
}

export interface PdfOrder {
  number: string
  statusLabel: string
  orderedOn: string
  expectedOn: string | null
  note: string | null
  totalAmount: number
  workspaceName: string
  supplierName: string
  supplierContactName: string | null
  supplierPhone: string | null
  supplierEmail: string | null
  supplierAddress: string | null
  locationName: string
  createdByName: string
  approvedAt: string | null
  items: PdfOrderItem[]
}

/** Kode karakter yang bisa ditulis PDF bawaan. Sisanya diganti tanda tanya. */
export function teksPdf(value: string | null | undefined): string {
  if (!value) return ''

  const bersih = [...value]
    .map((huruf) => {
      const kode = huruf.codePointAt(0) ?? 0
      // Karakter kontrol membuat pdfkit menuliskan byte tak terlihat ke berkas.
      if (kode < 0x20 || kode === 0x7f) return ' '
      // Font bawaan hanya punya WinAnsi, jadi huruf di luar itu tidak punya tempat.
      if (kode > 0xff) return '?'
      return huruf
    })
    .join('')

  return bersih.trim()
}

function rupiah(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${amount < 0 ? '-' : ''}Rp${digits}`
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

/**
 * Menghasilkan PDF sebagai Buffer. Fungsi ini tidak menyentuh database maupun
 * jaringan, jadi bisa diuji tanpa menyiapkan workspace.
 */
export function renderPurchaseOrderPdf(order: PdfOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Purchase Order ${teksPdf(order.number)}`,
        Author: teksPdf(order.workspaceName),
        Creator: 'Sahabat UMKM',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const lebarIsi = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const kolom = [
      { judul: 'Barang', lebar: lebarIsi * 0.44, rata: 'left' as const },
      { judul: 'Jumlah', lebar: lebarIsi * 0.14, rata: 'right' as const },
      { judul: 'Harga satuan', lebar: lebarIsi * 0.21, rata: 'right' as const },
      { judul: 'Jumlah nilai', lebar: lebarIsi * 0.21, rata: 'right' as const },
    ]

    doc.font('Helvetica-Bold').fontSize(16).text('PURCHASE ORDER')
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333333')
      .text(`Nomor ${teksPdf(order.number)} · ${teksPdf(order.statusLabel)}`)

    doc.moveDown(0.6)

    // Dua blok alamat digambar berdampingan. Keduanya punya lebar tetap supaya
    // alamat supplier yang panjang tidak menimpa kolom kirinya.
    const marginKiri = doc.page.margins.left
    const lebarKolom = lebarIsi * 0.48
    const awal = doc.y

    const tulisBlok = (judul: string, baris: string[], x: number): number => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(judul, x, awal, {
        width: lebarKolom,
      })
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
      let y = awal + 14
      for (const barisTeks of baris) {
        doc.text(barisTeks, x, y, { width: lebarKolom })
        y += doc.heightOfString(barisTeks, { width: lebarKolom })
      }
      return y - awal
    }

    const tinggiKiri = tulisBlok(
      'Penerima',
      [
        teksPdf(order.workspaceName),
        order.createdByName ? `Dibuat oleh ${teksPdf(order.createdByName)}` : '',
        `Lokasi penyimpanan: ${teksPdf(order.locationName)}`,
      ].filter((baris) => baris !== ''),
      marginKiri,
    )

    const tinggiKanan = tulisBlok(
      'Supplier',
      [
        teksPdf(order.supplierName),
        teksPdf(order.supplierContactName),
        teksPdf(order.supplierPhone),
        teksPdf(order.supplierEmail),
        teksPdf(order.supplierAddress),
      ].filter((baris) => baris !== ''),
      marginKiri + lebarIsi * 0.52,
    )

    doc.y = awal + Math.max(tinggiKiri, tinggiKanan) + 8
    doc.font('Helvetica').fontSize(10).fillColor('#333333')

    doc.font('Helvetica').fontSize(10).fillColor('#333333')
    doc.text(`Tanggal order: ${teksPdf(order.orderedOn)}`)
    if (order.expectedOn) doc.text(`Perkiraan tiba: ${teksPdf(order.expectedOn)}`)
    if (order.approvedAt) doc.text(`Disetujui: ${teksPdf(order.approvedAt)}`)

    doc.y += 14

    // Header tabel digambar sendiri supaya lebar tiap kolom bisa dikontrol dan
    // baris yang panjang membungkus hanya di kolom barang.
    doc.strokeColor('#999999')
    let y = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
    let x = doc.page.margins.left
    for (const kolomTabel of kolom) {
      doc.text(kolomTabel.judul, x, y, {
        width: kolomTabel.lebar - 6,
        align: kolomTabel.rata,
      })
      x += kolomTabel.lebar
    }
    y += 14

    doc.moveTo(doc.page.margins.left, y - 2).lineTo(doc.page.width - doc.page.margins.right, y - 2).stroke()
    doc.font('Helvetica').fontSize(9)

    for (const item of order.items) {
      const tinggiBaris = Math.max(
        doc.heightOfString(teksPdf(item.productName), { width: kolom[0]!.lebar - 6 }),
        10,
      )

      if (y + tinggiBaris > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage()
        y = doc.page.margins.top
      }

      const nilai = [
        `${teksPdf(item.productName)} (${teksPdf(item.sku)})`,
        `${quantity(item.quantity)} ${teksPdf(item.unitCode)}`,
        rupiah(item.unitPrice),
        rupiah(item.lineTotal),
      ]

      x = doc.page.margins.left
      kolom.forEach((kolomTabel, index) => {
        doc.fillColor('#222222').text(nilai[index] ?? '', x, y, {
          width: kolomTabel.lebar - 6,
          align: kolomTabel.rata,
        })
        x += kolomTabel.lebar
      })

      y += tinggiBaris + 5
    }

    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke()
    y += 10

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111')
    doc.text(`Total: ${rupiah(order.totalAmount)}`, doc.page.margins.left, y, {
      width: lebarIsi,
      align: 'right',
    })
    y += 22

    if (order.note) {
      doc.font('Helvetica').fontSize(9).fillColor('#333333')
      doc.text(`Catatan: ${teksPdf(order.note)}`, doc.page.margins.left, y, { width: lebarIsi })
    }

    doc.end()
  })
}