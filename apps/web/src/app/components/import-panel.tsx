'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  apiPost,
  downloadImportTemplate,
  errorMessage,
  importTemplateCsv,
  readImportPayload,
  type ImportFilePayload,
  type ImportKind,
  type ImportPreviewBase,
} from '../../lib/api'
import { Alert } from './ui'

/**
 * Alur impor dua langkah untuk keempat jenis impor PRD 6.8: pilih berkas, periksa,
 * lalu simpan.
 *
 * Pratinjau tidak menulis apa pun, jadi berkas yang salah ketahuan sebelum ada data
 * yang tersimpan. Impor berjalan penuh atau tidak sama sekali: selama masih ada satu
 * baris bermasalah, tombol simpan mati dan server juga menolak commit yang tidak
 * lengkap.
 *
 * Berkas XLSX dibaca di peramban menjadi base64 karena JSON tidak membawa biner.
 * Kotak isian tetap ada untuk CSV supaya berkas kecil bisa ditempel dan diperbaiki
 * langsung.
 */

export interface ImportJobResult {
  replayed: boolean
  importJobId: number
}

const LINK_BUTTON =
  'inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'
const PRIMARY_BUTTON =
  'inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'

export function ImportPanel<TSample, TPreview extends ImportPreviewBase, TResult extends ImportJobResult>({
  workspaceId,
  kind,
  previewPath,
  commitPath,
  columnsHint,
  sampleOf,
  renderSample,
  renderResult,
  skippedRowsOf,
}: {
  workspaceId: number
  kind: ImportKind
  /** Path relatif di bawah /api/workspaces/:id, misalnya /imports/products/preview. */
  previewPath: string
  commitPath: string
  columnsHint: ReactNode
  /** Ambil daftar contoh baris dari hasil pratinjau. */
  sampleOf: (preview: TPreview) => TSample[]
  renderSample: (sample: TSample, index: number) => string
  renderResult: (result: TResult) => string
  /** Baris yang dilewati saat impor, hanya untuk jenis yang punya. */
  skippedRowsOf?: (result: TResult) => Array<{ rowNumber: number; message: string }>
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [kunci, setKunci] = useState(() => kunciImporBaru(kind))
  const [preview, setPreview] = useState<TPreview | null>(null)
  const [result, setResult] = useState<TResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const siapDikirim = content.trim() !== '' || fileBase64 !== null

  function bersihkanHasilLama() {
    setPreview(null)
    setResult(null)
    setError(null)
    setKunci(kunciImporBaru(kind))
  }

  function payloadKarenaIni(): ImportFilePayload {
    return fileBase64
      ? { fileName: fileName ?? 'berkas.xlsx', contentBase64: fileBase64 }
      : { fileName: fileName ?? 'berkas.csv', content }
  }

  async function bacaBerkas(file: File) {
    setBusy(true)
    const dibaca = await readImportPayload(file)
    setBusy(false)

    if (!dibaca.ok) {
      setError(errorMessage(dibaca.error, 'Berkas tidak bisa dibaca.'))
      return
    }

    bersihkanHasilLama()
    setFileName(dibaca.data.fileName)
    setContent(dibaca.data.content ?? '')
    setFileBase64(dibaca.data.contentBase64 ?? null)
  }

  async function isiContoh() {
    setBusy(true)
    const contoh = await importTemplateCsv(workspaceId, kind)
    setBusy(false)

    if (!contoh.ok) {
      setError(errorMessage(contoh.error, 'Contoh template tidak bisa dimuat.'))
      return
    }

    bersihkanHasilLama()
    setFileName(`contoh-impor-${kind.replace(/_/g, '-')}.csv`)
    setContent(contoh.data)
    setFileBase64(null)
  }

  async function unduhTemplate(format: 'csv' | 'xlsx') {
    setBusy(true)
    const hasil = await downloadImportTemplate(workspaceId, kind, format)
    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Template tidak bisa diunduh.'))
    }
  }

  async function periksa() {
    if (!siapDikirim) {
      setError('Pilih berkas atau isi kotak isian lebih dulu.')
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)

    const hasil = await apiPost<TPreview>(`/api/workspaces/${workspaceId}${previewPath}`, {
      ...payloadKarenaIni(),
      idempotencyKey: kunci,
    })
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

    const hasil = await apiPost<TResult>(`/api/workspaces/${workspaceId}${commitPath}`, {
      ...payloadKarenaIni(),
      idempotencyKey: kunci,
    })
    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Impor tidak bisa dijalankan.'))
      return
    }

    setResult(hasil.data)
    setPreview(null)
    setContent('')
    setFileBase64(null)
    setFileName(null)
  }

  const dilewati = result && skippedRowsOf ? skippedRowsOf(result) : []
  const sampleLines = preview ? sampleOf(preview).map((sample, index) => renderSample(sample, index)) : []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error ? <Alert kind="error">{error}</Alert> : null}

      {result ? (
        <Alert kind="success">
          {renderResult(result)} Hasilnya bisa dibatalkan dari{' '}
          <Link className="underline underline-offset-4" href="/pengaturan/impor-ekspor">
            riwayat impor
          </Link>{' '}
          selama belum ada transaksi lain yang memakainya.
        </Alert>
      ) : null}

      {dilewati.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
          aria-labelledby="baris-dilewati"
        >
          <h2 className="text-lg font-semibold" id="baris-dilewati">
            Baris yang dilewati
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
            {dilewati.map((row) => (
              <li key={row.rowNumber}>
                Baris {row.rowNumber}: {row.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={LINK_BUTTON} onClick={() => void isiContoh()} disabled={busy}>
          Isi contoh di layar
        </button>
        <button type="button" className={LINK_BUTTON} onClick={() => void unduhTemplate('csv')} disabled={busy}>
          Unduh template CSV
        </button>
        <button type="button" className={LINK_BUTTON} onClick={() => void unduhTemplate('xlsx')} disabled={busy}>
          Unduh template XLSX
        </button>
      </div>

      <form
        className="flex max-w-[34rem] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void periksa()
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="berkas">
            Berkas CSV atau XLSX
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="berkas"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void bacaBerkas(file)
            }}
          />
          {fileName ? <p className="text-sm text-text-secondary">Dipilih: {fileName}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="isi-berkas">
            Isi berkas CSV
          </label>
          <textarea
            className="min-h-32 w-full rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-[0.9375rem] text-text-primary transition-colors duration-150 hover:border-text-secondary"
            id="isi-berkas"
            value={content}
            placeholder="Tempel isi berkas CSV di sini, atau pilih berkasnya di atas."
            rows={8}
            onChange={(event) => {
              const baru = event.target.value
              setContent(baru)
              setFileBase64(null)
              setPreview(null)
              setResult(null)
              if (baru !== '') setKunci(kunciImporBaru(kind))
            }}
          />
          <p className="text-sm text-text-secondary">{columnsHint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={LINK_BUTTON} disabled={busy || !siapDikirim}>
            {busy ? 'Memproses' : 'Periksa berkas'}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => void simpan()}
            disabled={busy || preview === null}
          >
            {busy ? 'Menyimpan' : 'Simpan baris yang valid'}
          </button>
        </div>
      </form>

      {preview ? (
        <section
          className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
          aria-labelledby="hasil-periksa"
        >
          <h2 className="text-lg font-semibold" id="hasil-periksa">
            Hasil pemeriksaan
          </h2>
          <p className="text-[0.9375rem] text-text-secondary">
            {preview.validRows} dari {preview.totalRows} baris bisa disimpan.
            {preview.problemRows > 0
              ? ` ${preview.problemRows} baris bermasalah.`
              : ' Tidak ada baris bermasalah.'}
          </p>

          {preview.problemRows > 0 ? (
            <>
              <p className="text-[0.9375rem] text-text-secondary">
                Impor berjalan penuh atau tidak sama sekali. Perbaiki baris di bawah ini, lalu periksa
                lagi. Tidak ada data yang tersimpan selama masih ada baris bermasalah.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
                {preview.problems.map((problem) => (
                  <li key={`${problem.rowNumber}-${problem.message}`}>
                    Baris {problem.rowNumber}: {problem.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {sampleLines.length > 0 ? (
            <>
              <p className="text-[0.9375rem] text-text-secondary">
                Contoh baris yang akan disimpan:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
                {sampleLines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function kunciImporBaru(kind: ImportKind): string {
  return `impor-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
