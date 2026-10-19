'use client'

import { useApp } from '../../components/app-context'
import { ImportPanel } from '../../components/import-panel'
import type { SalesImportPreview, SalesImportResult } from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { formatQty, rupiah } from '../bagian'

/**
 * PRD 6.4 dan 6.8: impor penjualan dari CSV atau XLSX dengan validasi per baris.
 *
 * Pratinjau dijalankan lebih dulu dan tidak menulis apa pun, jadi kesalahan berkas
 * ketahuan sebelum ada penjualan yang tercatat dan stok yang berkurang. Hasil impor
 * bisa dibatalkan dari riwayat impor selama belum ada transaksi lain di atasnya.
 */
export default function SalesImportPage() {
  const app = useApp()

  return (
    <SalesShell activeHref="/penjualan/impor" title="Impor penjualan">
      <ImportPanel
        workspaceId={app.workspaceId}
        kind="penjualan"
        previewPath="/imports/sales/preview"
        commitPath="/imports/sales"
        columnsHint={
          <>
            Kolom wajib: tanggal, lokasi, sku, jumlah, harga jual. Kolom pelanggan, metode
            pembayaran, dan diskon boleh dikosongkan. Tanggal ditulis YYYY-MM-DD. Satu baris
            berarti satu penjualan dengan satu barang.
          </>
        }
        sampleOf={(preview: SalesImportPreview) => preview.sample}
        renderSample={(sample) =>
          `Baris ${sample.rowNumber}: ${sample.soldOn}, ${sample.sku}, ${formatQty(sample.quantity)} x ${rupiah(sample.unitPrice)}`
        }
        renderResult={(result: SalesImportResult) => {
          const nomor = result.firstNumber
            ? ` dari ${result.firstNumber} sampai ${result.lastNumber}`
            : ''
          return `${result.imported} penjualan tersimpan${nomor}, total ${rupiah(result.totalAmount)}.`
        }}
      />
    </SalesShell>
  )
}
