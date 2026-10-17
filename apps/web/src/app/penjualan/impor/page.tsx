'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import {
  apiPost,
  errorMessage,
  type SalesImportPreview,
  type SalesImportResult,
} from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { formatQty, rupiah } from '../bagian'

/**
 * PRD 6.4 dan 6.8: impor penjualan dari CSV dengan validasi per baris.
 *
 * Dua langkah yang dipisah: pratinjau lebih dulu, commit setelahnya. Pratinjau tidak
 * menulis apa pun, jadi pengguna bisa memperbaiki berkas sebelum ada penjualan yang
 * tercatat dan stok yang berkurang.
 */

const TEMPLATE = [
  'tanggal,lokasi,pelanggan,metode pembayaran,sku,jumlah,harga jual,diskon',
  '2026-10-02,Kios,,Tunai,KP-001,2,45000,',
  '2026-10-02,Kios,Bu Sari,QRIS,KP-002,1,18000,500',
].join('\n')

export default function SalesImportPage() {
  const app = useApp()

  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<SalesImportPreview | null>(null)
  const [result, setResult] = useState<SalesImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kunci, setKunci] = useState('')

  function kunciBaru(): string {
    const dibuat = `impor-jual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    setKunci(dibuat)
    return dibuat
  }

  async function bacaBerkas(event: React.ChangeEvent<HTMLInputElement>) {
    const berkas = event.target.files?.[0]
    if (!berkas) return

    setError(null)
    setResult(null)
    setPreview(null)
    setFileName(berkas.name)

    if (berkas.size > 5_000_000) {
      setError('Berkas lebih dari 5 MB. Pecah berkasnya menjadi beberapa bagian.')
      setContent('')
      return
    }

    const teks = await berkas.text()
    setContent(teks)
    kunciBaru()
  }

  async function onPreview(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (content.trim() === '') {
      setError('Pilih berkas CSV lebih dulu.')
      return
    }

    setBusy(true)
    const hasil = await apiPost<SalesImportPreview>(
      `/api/workspaces/${app.workspaceId}/imports/sales/preview`,
      { content, fileName, idempotencyKey: kunci || kunciBaru() },
    )
    setBusy(false)

    if (!hasil.ok) {
      setPreview(null)
      setError(errorMessage(hasil.error, 'Berkas tidak bisa diperiksa.'))
      return
    }

    setPreview(hasil.data)
  }

  async function onCommit() {
    setError(null)
    setBusy(true)

    const hasil = await apiPost<SalesImportResult>(
      `/api/workspaces/${app.workspaceId}/imports/sales`,
      { content, fileName, idempotencyKey: kunci },
    )
    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Impor tidak bisa dijalankan.'))
      return
    }

    setResult(hasil.data)
    setPreview(null)
    setContent('')
    setFileName(null)
  }

  return (
    <SalesShell
      activeHref="/penjualan/impor"
      title="Impor penjualan"
      actions={
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          onClick={() => {
            setContent(TEMPLATE)
            setFileName('contoh-penjualan.csv')
            kunciBaru()
            setPreview(null)
            setResult(null)
            setError(null)
          }}
        >
          Isi contoh di layar
        </button>
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}

      {result ? (
        <Alert kind="success">
          {result.imported} penjualan tersimpan dari {result.firstNumber} sampai {result.lastNumber}
          , total {rupiah(result.totalAmount)}. Hasil impor bisa dibatalkan dari daftar penjualan
          selama barangnya belum dipakai untuk transaksi lain.
        </Alert>
      ) : null}

      <form className="flex max-w-[46rem] flex-col gap-4" onSubmit={onPreview}>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="berkas">
            Berkas CSV
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="berkas"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void bacaBerkas(event)}
          />
          {fileName ? <p className="text-sm text-text-secondary">{fileName}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="konten-berkas">
            Isi berkas
          </label>
          <textarea
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="konten-berkas"
            rows={8}
            value={content}
            onChange={(event) => {
              setContent(event.target.value)
              if (event.target.value !== '') kunciBaru()
            }}
          />
          <p className="text-sm text-text-secondary">
            Kolom wajib: tanggal, lokasi, sku, jumlah, harga jual. Tanggal ditulis YYYY-MM-DD.
            Kolom pelanggan dan diskon boleh dikosongkan.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy || content.trim() === ''}
        >
          {busy ? 'Memeriksa' : 'Periksa berkas'}
        </button>
      </form>

      {error ? (
        <ErrorState
          title="Impor tidak dilanjutkan"
          body={error}
          action={
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              onClick={() => setError(null)}
            >
              Tutup
            </button>
          }
        />
      ) : null}

      {preview ? (
        <section className="flex flex-col gap-2" aria-labelledby="hasil-periksa">
          <h2 id="hasil-periksa" className="text-lg font-semibold">
            Hasil pemeriksaan
          </h2>
          <p className="text-[0.9375rem] text-text-secondary">
            {preview.validRows} dari {preview.totalRows} baris bisa disimpan.
            {preview.problemRows > 0
              ? ` ${preview.problemRows} baris bermasalah.`
              : ' Tidak ada baris bermasalah.'}
          </p>

          {preview.problems.length > 0 ? (
            <>
              <p className="text-[0.9375rem] text-text-secondary">Baris yang perlu diperbaiki:</p>
              <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
                {preview.problems.map((problem) => (
                  <li key={`${problem.rowNumber}-${problem.message}`}>
                    Baris {problem.rowNumber}: {problem.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {preview.sample.length > 0 ? (
            <>
              <p className="text-[0.9375rem] text-text-secondary">Contoh baris yang akan disimpan:</p>
              <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
                {preview.sample.map((baris) => (
                  <li key={baris.rowNumber}>
                    Baris {baris.rowNumber}: {baris.soldOn}, {baris.sku},{' '}
                    {formatQty(baris.quantity)} x {rupiah(baris.unitPrice)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              disabled={busy || preview.problemRows > 0 || preview.validRows === 0}
              onClick={() => void onCommit()}
            >
              {busy ? 'Menyimpan' : 'Simpan penjualan'}
            </button>
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              onClick={() => setPreview(null)}
            >
              Ubah berkas lagi
            </button>
          </div>

          {preview.problemRows > 0 ? (
            <p className="text-sm text-text-secondary">
              Tombol simpan mati karena masih ada baris bermasalah. Perbaiki berkas lalu periksa
              lagi. Impor berjalan penuh atau tidak sama sekali, jadi tidak ada penjualan yang
              tersimpan sebagian.
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="text-sm text-text-secondary">
        <Link
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
          href="/penjualan"
        >
          Kembali ke daftar penjualan
        </Link>
      </p>
    </SalesShell>
  )
}
