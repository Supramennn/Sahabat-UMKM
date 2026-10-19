'use client'

import { useApp } from '../../components/app-context'
import { ImportPanel } from '../../components/import-panel'
import { PurchasingShell } from '../pembelian-shell'
import type { SupplierImportPreview, SupplierImportResult } from '../../../lib/api'

/**
 * PRD 6.8: impor supplier dari CSV atau XLSX dengan pratinjau.
 *
 * Supplier yang namanya sudah ada dilewati, bukan ditulis ulang: menimpa data
 * supplier lama diam-diam akan mengubah arti dokumen pembelian yang menyebutnya.
 */
export default function ImportSuppliersPage() {
  const app = useApp()

  return (
    <PurchasingShell activeHref="/pembelian/impor-supplier" title="Impor supplier">
      <ImportPanel
        workspaceId={app.workspaceId}
        kind="supplier"
        previewPath="/imports/suppliers/preview"
        commitPath="/imports/suppliers"
        columnsHint={
          <>
            Kolom wajib: nama. Kolom lain boleh ada atau tidak: kontak, telepon, email, alamat,
            termin, catatan. Termin ditulis jumlah hari, misalnya 30. Supplier yang namanya sudah
            ada di daftar supplier akan dilewati.
          </>
        }
        sampleOf={(preview: SupplierImportPreview) => preview.sample}
        renderSample={(sample) => {
          const kontak = sample.contactName ? `, kontak ${sample.contactName}` : ''
          const telepon = sample.phone ? `, ${sample.phone}` : ''
          return `Baris ${sample.rowNumber}: ${sample.name}${kontak}${telepon}`
        }}
        renderResult={(result: SupplierImportResult) => {
          const dilewati =
            result.skipped > 0 ? `, ${result.skipped} baris dilewati karena namanya sudah ada` : ''
          return `${result.imported} supplier tersimpan${dilewati}.`
        }}
        skippedRowsOf={(result: SupplierImportResult) => result.skippedRows}
      />
    </PurchasingShell>
  )
}
