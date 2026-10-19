'use client'

import Link from 'next/link'
import { formatRupiah } from '@sahabat/shared'
import { useApp } from '../../components/app-context'
import { ImportPanel } from '../../components/import-panel'
import { AppShell } from '../../components/shell'
import type { ImportPreview, ImportResult } from '../../../lib/api'

/**
 * PRD 6.8: impor barang dari CSV atau XLSX dengan pratinjau. Pratinjau tidak
 * menulis apa pun, dan impor berjalan penuh atau tidak sama sekali.
 *
 * Stok awal tidak lagi ikut di berkas barang: saldo awal butuh kolom lokasi dan
 * tercatat di ledger, jadi jalurnya di halaman Impor saldo awal (B-04).
 */
export default function ImportProductsPage() {
  const app = useApp()

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/impor"
      breadcrumb="Stok"
      title="Impor barang"
    >
      <ImportPanel
        workspaceId={app.workspaceId}
        kind="produk"
        previewPath="/imports/products/preview"
        commitPath="/imports/products"
        columnsHint={
          <>
            Kolom wajib: sku, nama, satuan. Kolom lain boleh ada atau tidak: kategori, harga beli,
            harga jual, stok minimum. Pemisah kolom boleh koma atau titik koma. Stok awal diisi
            lewat{' '}
            <Link className="underline underline-offset-4" href="/stok/impor-saldo-awal">
              Impor saldo awal
            </Link>{' '}
            karena butuh kolom lokasi.
          </>
        }
        sampleOf={(preview: ImportPreview) => preview.sample}
        renderSample={(sample) => {
          const jual = sample.sellingPrice !== null ? `, harga jual ${formatRupiah(sample.sellingPrice)}` : ''
          return `Baris ${sample.rowNumber}: ${sample.sku} — ${sample.name} (${sample.unitCode})${jual}`
        }}
        renderResult={(result: ImportResult) => {
          const kategori =
            result.categoriesCreated > 0 ? ` dan ${result.categoriesCreated} kategori dibuat` : ''
          const dilewati =
            result.skipped > 0 ? `, ${result.skipped} baris dilewati karena SKU-nya sudah ada` : ''
          return `${result.imported} barang tersimpan${kategori}${dilewati}.`
        }}
        skippedRowsOf={(result: ImportResult) => result.skippedRows}
      />
    </AppShell>
  )
}
