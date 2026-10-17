'use client'

import { useCallback, useState } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import { apiPost, errorMessage, type ImportPreview, type ImportResult } from '../../../lib/api'

/**
 * PRD 6.8: impor produk dengan pratinjau. Berkas divalidasi lebih dulu dan
 * pengguna melihat jumlah baris valid beserta baris bermasalah sebelum ada data
 * yang tersimpan.
 *
 * Dua tombol sengaja terpisah: periksa berkas dan simpan. Menekan yang kedua
 * tanpa pernah melihat hasil pemeriksaan adalah cara paling cepat menyimpan data
 * yang salah.
 */

const TEMPLATE = `sku,nama,kategori,satuan,harga beli,harga jual,stok minimum
KOPI-1,Kopi bubuk 250 g,Minuman,pcs,45000,60000,5
GULA-1,Gula pasir,Minuman,kg,16000,22000,3
`

export default function ImportProductsPage() {
  const app = useApp()

  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Kunci idempotensi dibuat sekali per berkas, bukan tiap klik, supaya menekan
  // simpan dua kali tidak mengimpor dua kali dan memakai kunci yang sama.
  const [idempotencyKey] = useState(() => `impor-${Date.now().toString(36)}`)

  const bacaBerkas = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    setPreview(null)
    setResult(null)

    try {
      const isi = await file.text()
      setFileName(file.name)
      setContent(isi)
    } catch {
      setError('Berkas tidak bisa dibaca.')
    }

    setBusy(false)
  }, [])

  async function periksa() {
    setBusy(true)
    setError(null)
    setResult(null)

    const hasil = await apiPost<ImportPreview>(
      `/api/workspaces/${app.workspaceId}/imports/products/preview`,
      { content, idempotencyKey },
    )
    setBusy(false)

    if (!hasil.ok) {
      setPreview(null)
      setError(errorMessage(hasil.error, 'Berkas tidak bisa diperiksa.'))
      return
    }

    setPreview(hasil.data)
  }

  async function simpan() {
    setBusy(true)
    setError(null)

    const hasil = await apiPost<ImportResult>(
      `/api/workspaces/${app.workspaceId}/imports/products`,
      { content, idempotencyKey },
    )
    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Impor tidak bisa dijalankan.'))
      return
    }

    setResult(hasil.data)
    setPreview(null)
    setContent('')
    setFileName('')
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/impor"
      breadcrumb="Stok"
      title="Impor barang"
    >
      <p className="text-sm text-text-secondary">
        Pemisahan kolom boleh koma atau titik koma, dan angka boleh memakai titik
        sebagai pemisah ribuan. Format lain belum bisa dibaca.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          onClick={() => {
            setContent(TEMPLATE)
            setFileName('contoh-impor.csv')
          }}
        >
          Lihat contoh format
        </button>
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          onClick={() => {
            const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const tautan = document.createElement('a')
            tautan.href = url
            tautan.download = 'template-impor-produk.csv'
            tautan.click()
            URL.revokeObjectURL(url)
          }}
        >
          Unduh template CSV
        </button>
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {result ? (
        <Alert kind="success">
          {result.imported} barang tersimpan
          {result.skipped > 0 ? `, ${result.skipped} baris dilewati karena SKU sudah ada` : ''}.
        </Alert>
      ) : null}

      {result && result.skippedRows.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold text-text-primary">Baris yang dilewati</p>
          <ul className="flex flex-col gap-2">
            {result.skippedRows.map((row) => (
              <li
                key={row.rowNumber}
                className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              >
                <span className="text-sm text-text-secondary">
                  Baris {row.rowNumber}: {row.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="berkas">
            Berkas CSV
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="berkas"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void bacaBerkas(file)
            }}
          />
          {fileName ? <p className="text-sm text-text-secondary">Dipilih: {fileName}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="isi-berkas">
            Isi berkas
          </label>
          <textarea
            className="min-h-32 w-full rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-[0.9375rem] text-text-primary transition-colors duration-150 hover:border-text-secondary"
            id="isi-berkas"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={8}
            placeholder="sku,nama,kategori,satuan,harga beli"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
            onClick={() => void periksa()}
            disabled={busy || content === ''}
          >
            {busy ? 'Memproses' : 'Periksa berkas'}
          </button>
          <button
            type="button"
            className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
            onClick={() => void simpan()}
            disabled={busy || content === '' || preview === null}
          >
            Simpan barang yang valid
          </button>
        </div>
      </form>

      {preview ? (
        <div className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold text-text-primary">
            {preview.validRows} dari {preview.totalRows} baris bisa disimpan
          </p>

          {preview.problemRows > 0 ? (
            <>
              <p className="text-[0.9375rem] text-text-secondary">
                Impor berjalan penuh atau tidak sama sekali. Perbaiki {preview.problemRows}{' '}
                baris di bawah ini, lalu periksa lagi.
              </p>
              <ul className="flex flex-col gap-2">
                {preview.problems.map((problem) => (
                  <li
                    key={problem.rowNumber}
                    className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
                  >
                    <span className="text-sm text-text-secondary">
                      Baris {problem.rowNumber}: {problem.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[0.9375rem] text-text-secondary">
              Semua baris bisa disimpan. Tekan Simpan barang yang valid untuk melanjutkan.
            </p>
          )}
        </div>
      ) : null}

      {preview && preview.problemRows > 0 ? (
        <ErrorState
          title="Impor belum bisa dijalankan"
          body="Perbaiki baris bermasalah lebih dulu. Tidak ada data yang tersimpan selama masih ada baris bermasalah."
        />
      ) : null}
    </AppShell>
  )
}
