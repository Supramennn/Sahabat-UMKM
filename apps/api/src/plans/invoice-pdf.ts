import PDFDocument from 'pdfkit'
import { formatRupiah } from '@sahabat/shared'
import { teksPdf } from '../purchasing/pdf.ts'
import type { InvoicePayment } from './billing-service.ts'
import type { SellerIdentity } from './billing.ts'

/**
 * Faktur PDF per pembayaran (PRD 6.10).
 *
 * Isinya hanya data yang benar-benar tercatat: identitas penjual dari
 * environment, identitas pembeli dari workspace dan pemesan, nominal yang
 * tersimpan di baris pembayaran, dan tanggal pelunasan. Tidak ada baris pajak,
 * karena perlakuan pajak langganan belum ditetapkan (PRD 6.10 dan 15), dan
 * mencantumkan angka pajak yang belum diputuskan justru menyesatkan.
 */

export interface InvoicePdfInput {
  invoice: InvoicePayment
  seller: SellerIdentity
}

function tanggalPdf(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone }).format(value)
}

export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const { invoice, seller } = input

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Faktur ${teksPdf(invoice.number)}`,
        Author: teksPdf(seller.name),
        Creator: 'Sahabat UMKM',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const lebarIsi = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const marginKiri = doc.page.margins.left

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111').text('FAKTUR')
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333333')
      .text(`Nomor ${teksPdf(invoice.number)}`)

    doc.moveDown(0.8)

    const awal = doc.y
    const lebarKolom = lebarIsi * 0.48

    const tulisBlok = (judul: string, baris: string[], x: number): number => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(judul, x, awal, { width: lebarKolom })
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
      let y = awal + 14
      for (const barisTeks of baris) {
        doc.text(barisTeks, x, y, { width: lebarKolom })
        y += doc.heightOfString(barisTeks, { width: lebarKolom })
      }
      return y - awal
    }

    const tinggiPenjual = tulisBlok(
      'Penjual',
      [
        teksPdf(seller.name),
        teksPdf(seller.address),
        teksPdf(seller.email),
        seller.taxId ? `NPWP: ${teksPdf(seller.taxId)}` : '',
      ].filter((baris) => baris !== ''),
      marginKiri,
    )

    const tinggiPembeli = tulisBlok(
      'Pembeli',
      [teksPdf(invoice.workspaceName), teksPdf(invoice.payerName), teksPdf(invoice.payerEmail)].filter(
        (baris) => baris !== '',
      ),
      marginKiri + lebarIsi * 0.52,
    )

    doc.y = awal + Math.max(tinggiPenjual, tinggiPembeli) + 10
    doc.font('Helvetica').fontSize(10).fillColor('#333333')
    doc.text(`Tanggal pembayaran: ${tanggalPdf(invoice.paidAt, seller.timeZone)}`)
    if (invoice.paymentMethodLabel) {
      doc.text(`Metode pembayaran: ${teksPdf(invoice.paymentMethodLabel)}`)
    }

    doc.y += 16

    const baris = `Paket ${teksPdf(invoice.planName)}, ${teksPdf(invoice.periodLabel.toLowerCase())}`
    const y = doc.y
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(baris, marginKiri, y, { width: lebarIsi * 0.7 })
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#222222')
      .text(formatRupiah(invoice.amount), marginKiri + lebarIsi * 0.7, y, {
        width: lebarIsi * 0.3,
        align: 'right',
      })

    let garisY = y + 18
    doc.moveTo(marginKiri, garisY).lineTo(doc.page.width - doc.page.margins.right, garisY).strokeColor('#999999').stroke()
    garisY += 10

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111111')
      .text(`Total dibayar: ${formatRupiah(invoice.amount)}`, marginKiri, garisY, {
        width: lebarIsi,
        align: 'right',
      })

    garisY += 30
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text('Harga belum termasuk pajak yang berlaku.', marginKiri, garisY, { width: lebarIsi })

    doc.end()
  })
}
