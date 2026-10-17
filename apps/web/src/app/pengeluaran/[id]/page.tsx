'use client'

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { API_BASE, apiGet, apiPost, errorMessage, type ExpenseDetailResponse } from '../../../lib/api'
import { ErrorState } from '../../components/ui'
import { useApp } from '../../components/app-context'
import { ExpensesShell } from '../pengeluaran-shell'

export default function ExpenseDetailPage() {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<ExpenseDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<ExpenseDetailResponse>(`/api/workspaces/${app.workspaceId}/expenses/${params.id}`)
    setLoading(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Rincian pengeluaran tidak bisa dimuat.'))
      return
    }
    setError(null)
    setDetail(result.data)
  }, [app.workspaceId, params.id])

  useEffect(() => { void load() }, [load])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setUploadMessage(null)
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran lampiran maksimal 5 MB.')
      event.target.value = ''
      return
    }
    setUploading(true)
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Berkas tidak bisa dibaca.'))
      reader.readAsDataURL(file)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Berkas tidak bisa dibaca.')
      return null
    })
    if (!data) {
      setUploading(false)
      event.target.value = ''
      return
    }
    const result = await apiPost<{ fileName: string }>(`/api/workspaces/${app.workspaceId}/expenses/${params.id}/attachments`, {
      contentType: file.type,
      fileName: file.name,
      data,
    })
    setUploading(false)
    event.target.value = ''
    if (!result.ok) {
      setError(errorMessage(result.error, 'Lampiran tidak bisa disimpan.'))
      return
    }
    setUploadMessage(`${result.data.fileName} ditambahkan.`)
    await load()
  }

  return (
    <ExpensesShell activeHref="/pengeluaran" title="Rincian pengeluaran" actions={<Link className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary" href="/pengeluaran">Kembali ke daftar</Link>}>
      {loading ? <p className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised" role="status">Memuat rincian pengeluaran.</p> : null}
      {error ? <ErrorState title="Rincian pengeluaran gagal dimuat" body={error} action={<button className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface" type="button" onClick={() => void load()}>Coba lagi</button>} /> : null}
      {uploadMessage ? <p role="status">{uploadMessage}</p> : null}
      {detail ? <>
        <section className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" aria-labelledby="expense-summary">
          <h2 className="text-lg font-semibold" id="expense-summary">{detail.expense.categoryName}</h2>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">{detail.expense.description}</p>
          <p className="text-2xl font-semibold tabular">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(detail.expense.amount)}</p>
          <dl>
            <div><dt>Tanggal</dt><dd>{detail.expense.spentOn}</dd></div>
            <div><dt>Referensi</dt><dd>{detail.expense.reference ?? 'Tidak ada'}</dd></div>
            <div><dt>Purchase order</dt><dd>{detail.expense.purchaseOrderNumber ?? 'Tidak ditautkan'}</dd></div>
            <div><dt>Dicatat oleh</dt><dd>{detail.expense.createdByName}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="attachments-title">
          <h2 className="text-lg font-semibold" id="attachments-title">Lampiran</h2>
          {detail.attachments.length === 0 ? <p className="text-sm text-text-secondary">Belum ada lampiran.</p> : <ul className="flex flex-col gap-2 pl-6">{detail.attachments.map((attachment) => <li key={attachment.id}>
            {attachment.kind === 'foto' ? <><a href={`${API_BASE}${attachment.url}`} target="_blank" rel="noreferrer">{attachment.fileName}</a><img className="block max-w-[min(100%,28rem)] max-h-96 object-contain" src={`${API_BASE}${attachment.url}`} alt={`Lampiran ${attachment.fileName}`} /></> : <a href={`${API_BASE}${attachment.url}`} target="_blank" rel="noreferrer">Unduh {attachment.fileName} (PDF)</a>}
          </li>)}</ul>}
          {app.role === 'owner' || app.role === 'admin' ? <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
            <label className="text-sm text-text-secondary" htmlFor="expense-attachment">Tambah foto atau PDF, maksimal 5 MB</label>
            <input className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary" id="expense-attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading || detail.attachments.length >= 5} onChange={(event) => void upload(event)} />
            {uploading ? <p role="status">Mengunggah lampiran.</p> : null}
            {detail.attachments.length >= 5 ? <p className="text-sm text-text-secondary">Batas lampiran tercapai.</p> : null}
          </div> : null}
        </section>
      </> : null}
    </ExpensesShell>
  )
}
