'use client'

import Link from 'next/link'
import { formatDate, formatQuantity, formatRupiah } from '@sahabat/shared'
import { useApp } from '../../components/app-context'
import { ImportPanel } from '../../components/import-panel'
import { AppShell } from '../../components/shell'
import type { OpeningImportPreview, OpeningImportResult } from '../../../lib/api'

/**
 * PRD 6.8: impor saldo awal dari CSV atau XLSX.
 *
 * Saldo awal adalah jenis impor tersendiri, bukan kolom di berkas barang, karena
 * tiap baris butuh lokasi dan menghasilkan transaksi stok masuk. Karena tercatat di
 * ledger, pembatalannya membuat baris pembalik, bukan menghapus riwayat (B-04).
 */
export default function ImportOpeningBalancesPage() {
  const app = useApp()

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/impor-saldo-awal"
      breadcrumb="Stok"
      title="Impor saldo awal"
    >
      <ImportPanel
        workspaceId={app.workspaceId}
        kind="saldo_awal"
        previewPath="/imports/opening-balances/preview"
        commitPath="/imports/opening-balances"
        columnsHint={
          <>
            Kolom wajib: sku, lokasi, jumlah. Kolom harga beli dan tanggal boleh dikosongkan;
            kalau tanggal kosong, dipakai tanggal hari ini. Barangnya harus sudah terdaftar di{' '}
            <Link className="underline underline-offset-4" href="/stok">
              daftar Stok
            </Link>
            , dan{' '}
            <Link className="underline underline-offset-4" href="/stok/lokasi">
              lokasinya
            </Link>{' '}
            harus sudah dibuat. Tanggal ditulis YYYY-MM-DD.
          </>
        }
        sampleOf={(preview: OpeningImportPreview) => preview.sample}
        renderSample={(sample) => {
          const biaya = sample.unitCost !== null ? `, harga beli ${formatRupiah(sample.unitCost)}` : ''
          const tanggal = sample.occurredOn ? `, tanggal ${tanggalIndonesia(sample.occurredOn)}` : ''
          return `Baris ${sample.rowNumber}: ${sample.sku} di ${sample.locationName}, jumlah ${formatQuantity(sample.quantity)}${biaya}${tanggal}`
        }}
        renderResult={(result: OpeningImportResult) =>
          `${result.imported} baris saldo awal tersimpan, total jumlah ${formatQuantity(result.totalQuantity)}.`
        }
      />
    </AppShell>
  )
}

/** Tanggal dari berkas ditulis YYYY-MM-DD, lalu ditampilkan seperti tanggal lain. */
function tanggalIndonesia(iso: string): string {
  const [tahun, bulan, hari] = iso.split('-').map((bagian) => Number.parseInt(bagian, 10))
  if (!tahun || !bulan || !hari) {
    return iso
  }
  return formatDate({ year: tahun, month: bulan, day: hari })
}
