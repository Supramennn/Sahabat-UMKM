'use client'

import { useCallback, useState } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import { apiPost, errorMessage, type ImportPreview, type ImportResult } from '../../../lib/api'
import styles from '../stok.module.css'

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
      <p className={styles.cardMeta}>
        Pemisahan kolom boleh koma atau titik koma, dan angka boleh memakai titik
        sebagai pemisah ribuan. Format lain belum bisa dibaca.
      </p>

      <div className={styles.emptyActions}>
        <button
          type="button"
          className={styles.paginationLink}
          onClick={() => {
            setContent(TEMPLATE)
            setFileName('contoh-impor.csv')
          }}
        >
          Lihat contoh format
        </button>
        <button
          type="button"
          className={styles.paginationLink}
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
        <div className={styles.state}>
          <p className={styles.stateTitle}>Baris yang dilewati</p>
          <ul className={styles.list}>
            {result.skippedRows.map((row) => (
              <li key={row.rowNumber} className={styles.card}>
                <span className={styles.cardMeta}>
                  Baris {row.rowNumber}: {row.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="berkas">
            Berkas CSV
          </label>
          <input
            className={styles.input}
            id="berkas"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void bacaBerkas(file)
            }}
          />
          {fileName ? <p className={styles.hint}>Dipilih: {fileName}</p> : null}
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="isi-berkas">
            Isi berkas
          </label>
          <textarea
            className={styles.textarea}
            id="isi-berkas"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={8}
            placeholder="sku,nama,kategori,satuan,harga beli"
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.paginationLink}
            onClick={() => void periksa()}
            disabled={busy || content === ''}
          >
            {busy ? 'Memproses' : 'Periksa berkas'}
          </button>
          <button
            type="button"
            className={styles.submit}
            onClick={() => void simpan()}
            disabled={busy || content === '' || preview === null}
          >
            Simpan barang yang valid
          </button>
        </div>
      </form>

      {preview ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>
            {preview.validRows} dari {preview.totalRows} baris bisa disimpan
          </p>

          {preview.problemRows > 0 ? (
            <>
              <p className={styles.stateBody}>
                Impor berjalan penuh atau tidak sama sekali. Perbaiki {preview.problemRows}{' '}
                baris di bawah ini, lalu periksa lagi.
              </p>
              <ul className={styles.list}>
                {preview.problems.map((problem) => (
                  <li key={problem.rowNumber} className={styles.card}>
                    <span className={styles.cardMeta}>
                      Baris {problem.rowNumber}: {problem.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.stateBody}>
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
