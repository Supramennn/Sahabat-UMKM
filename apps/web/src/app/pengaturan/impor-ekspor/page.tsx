'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { grantFor } from '@sahabat/shared'
import {
  API_BASE,
  apiGet,
  apiPost,
  errorMessage,
  type CancelImportResult,
  type ImportJob,
  type ImportJobsResponse,
} from '../../../lib/api'
import { Alert, Button, ErrorState } from '../../components/ui'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'

/**
 * Pengaturan Impor dan Ekspor (PRD 6.8).
 *
 * Halaman ini adalah pusat data: ekspor penuh, tautan ke keempat jenis impor, dan
 * riwayat impor beserta pembatalannya (B-04). Pembatalan hanya mungkin selama belum
 * ada transaksi lain yang menyentuh baris hasil impor; alasannya ditampilkan di
 * baris riwayat, bukan disembunyikan sampai tombolnya gagal.
 */
export default function DataPage() {
  return (
    <AppProvider title="Impor dan ekspor">
      <DataPageContent />
    </AppProvider>
  )
}

const CARD = 'flex min-w-0 flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised'

function DataPageContent() {
  const app = useApp()
  const bolehEkspor = grantFor(app.role, 'data.export') === 'manage'
  const bolehImpor = grantFor(app.role, 'data.import') === 'manage'
  const [mengunduh, setMengunduh] = useState(false)
  const [selesai, setSelesai] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  const [jobs, setJobs] = useState<ImportJob[] | null>(null)
  const [totalJobs, setTotalJobs] = useState(0)
  const [memuatRiwayat, setMemuatRiwayat] = useState(false)
  const [galatRiwayat, setGalatRiwayat] = useState<string | null>(null)
  const [suksesRiwayat, setSuksesRiwayat] = useState<string | null>(null)
  const [konfirmasiJobId, setKonfirmasiJobId] = useState<number | null>(null)
  const [sibukBatal, setSibukBatal] = useState(false)

  const muatRiwayat = useCallback(
    async (offset: number) => {
      setMemuatRiwayat(true)
      const hasil = await apiGet<ImportJobsResponse>(
        `/api/workspaces/${app.workspaceId}/imports?limit=20&offset=${offset}`,
      )
      setMemuatRiwayat(false)

      if (!hasil.ok) {
        setGalatRiwayat(errorMessage(hasil.error, 'Riwayat impor tidak bisa dimuat.'))
        return
      }

      setGalatRiwayat(null)
      setTotalJobs(hasil.data.pagination.total)
      setJobs((sebelumnya) =>
        offset === 0 ? hasil.data.jobs : [...(sebelumnya ?? []), ...hasil.data.jobs],
      )
    },
    [app.workspaceId],
  )

  useEffect(() => {
    if (bolehImpor) {
      void muatRiwayat(0)
    }
  }, [bolehImpor, muatRiwayat])

  async function batalkan(jobId: number) {
    setSibukBatal(true)
    setGalatRiwayat(null)
    setSuksesRiwayat(null)

    const hasil = await apiPost<CancelImportResult>(
      `/api/workspaces/${app.workspaceId}/imports/${jobId}/cancel`,
    )
    setSibukBatal(false)

    if (!hasil.ok) {
      setGalatRiwayat(errorMessage(hasil.error, 'Impor tidak bisa dibatalkan.'))
      // Alasan yang berubah di server tetap ditampilkan dengan memuat ulang.
      await muatRiwayat(0)
      return
    }

    setKonfirmasiJobId(null)
    setSuksesRiwayat(
      `Impor dibatalkan. ${hasil.data.cancelled} baris dari impor itu dikembalikan ke keadaan sebelumnya.`,
    )
    await muatRiwayat(0)
  }

  async function unduh() {
    setMengunduh(true)
    setSelesai(false)
    setGalat(null)
    try {
      const response = await fetch(`${API_BASE}/api/workspaces/${app.workspaceId}/exports/workspace`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        setGalat(body.message ?? 'Arsip data tidak dapat dibuat.')
        return
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'sahabat-umkm-data.zip'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setSelesai(true)
    } catch {
      setGalat('Tidak bisa menghubungi server untuk membuat arsip.')
    } finally {
      setMengunduh(false)
    }
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/impor-ekspor"
      breadcrumb="Pengaturan"
      title="Impor dan ekspor"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <section className={CARD} aria-labelledby="ekspor-data">
          <h2 className="text-lg font-semibold" id="ekspor-data">Ekspor seluruh data usaha</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Arsip berisi seluruh data workspace dalam berkas CSV, satu berkas untuk satu
            tabel: produk, stok, pembelian, penjualan, pengeluaran, dan seterusnya.
            Tersedia untuk semua paket dan tidak dikenai biaya tambahan.
          </p>
          <ul className="flex flex-col gap-2 pl-4 text-[0.9375rem] text-text-secondary">
            <li>Berkas CSV bisa dibuka di aplikasi spreadsheet mana pun.</li>
            <li>Kolom id dipertahankan supaya hubungan antar tabel bisa ditelusuri.</li>
            <li>Ada PANDUAN.txt di dalam arsip yang menjelaskan isinya.</li>
            <li>Foto dan PDF lampiran pengeluaran tidak ikut karena berbentuk berkas gambar.</li>
          </ul>

          {bolehEkspor ? (
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void unduh()} disabled={mengunduh}>
                {mengunduh ? 'Menyiapkan arsip...' : 'Unduh arsip data'}
              </Button>
            </div>
          ) : (
            <Alert kind="info">
              Hanya Owner dan Admin yang dapat mengunduh seluruh data workspace. Anda tetap
              bisa mengekspor laporan sesuai izin Anda dari halaman Laporan.
            </Alert>
          )}

          {galat ? <ErrorState title="Ekspor data tidak berhasil" body={galat} action={<Button type="button" variant="secondary" onClick={() => void unduh()}>Coba lagi</Button>} /> : null}
          {selesai ? <Alert kind="success">Arsip data sudah diunduh. Simpan berkas itu di tempat yang aman karena isinya data usaha Anda.</Alert> : null}
        </section>

        <section className={CARD} aria-labelledby="impor-data">
          <h2 className="text-lg font-semibold" id="impor-data">Impor data</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Impor berjalan dua langkah: periksa dulu pratinjaunya, lalu simpan. Setiap halaman
            menyediakan template CSV dan XLSX yang bisa diunduh; batas berkasnya 5 MB untuk CSV
            dan 7 MB untuk XLSX.
          </p>
          <ul className="flex flex-col gap-2 pl-4 text-[0.9375rem] text-text-secondary">
            <li><Link href="/stok/impor">Impor barang</Link> untuk menambah produk beserta kategorinya.</li>
            <li><Link href="/stok/impor-saldo-awal">Impor saldo awal</Link> untuk mengisi stok awal per lokasi setelah barangnya terdaftar.</li>
            <li><Link href="/pembelian/impor-supplier">Impor supplier</Link> untuk memindahkan daftar supplier lama.</li>
            <li><Link href="/penjualan/impor">Impor penjualan</Link> untuk memindahkan riwayat penjualan lama.</li>
          </ul>
        </section>

        <section className={CARD} aria-labelledby="riwayat-impor">
          <h2 className="text-lg font-semibold" id="riwayat-impor">Riwayat impor</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Hasil impor bisa dibatalkan selama belum ada transaksi lain yang memakainya.
            Setelah dipakai, barisnya menjadi bagian dari riwayat dan tidak bisa dihapus.
          </p>

          {!bolehImpor ? (
            <Alert kind="info">
              Hanya Owner dan Admin yang dapat melihat dan membatalkan impor.
            </Alert>
          ) : null}

          {bolehImpor && suksesRiwayat ? <Alert kind="success">{suksesRiwayat}</Alert> : null}
          {bolehImpor && galatRiwayat ? <Alert kind="error">{galatRiwayat}</Alert> : null}

          {bolehImpor && jobs === null && memuatRiwayat ? (
            <p role="status" className="text-[0.9375rem] text-text-secondary">
              Memuat riwayat impor.
            </p>
          ) : null}

          {bolehImpor && jobs !== null && jobs.length === 0 ? (
            <p className="text-[0.9375rem] text-text-secondary">
              Belum ada impor yang dijalankan di workspace ini.
            </p>
          ) : null}

          {bolehImpor && jobs !== null && jobs.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {jobs.map((job) => (
                <li className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-background p-4" key={job.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-text-primary">{job.kindLabel}</p>
                    <span
                      className={
                        job.status === 'dibatalkan'
                          ? 'inline-flex items-center rounded-badge border border-danger px-2 py-0.5 text-xs font-medium text-danger'
                          : 'inline-flex items-center rounded-badge border border-success px-2 py-0.5 text-xs font-medium text-success'
                      }
                    >
                      {job.status === 'dibatalkan' ? 'Dibatalkan' : 'Selesai'}
                    </span>
                  </div>

                  <p className="text-sm text-text-secondary">
                    {job.fileName ?? 'Tanpa nama berkas'} · {tanggalJam(job.createdAt)}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {job.importedRows} baris tersimpan
                    {job.skippedRows > 0 ? `, ${job.skippedRows} dilewati` : ''}
                    {job.createdByName ? ` oleh ${job.createdByName}` : ''}.
                    {job.status === 'dibatalkan' && job.cancelledByName
                      ? ` Dibatalkan oleh ${job.cancelledByName}.`
                      : ''}
                  </p>

                  {job.status === 'selesai' && !job.cancelable && job.cancelBlockedReason ? (
                    <p className="text-sm text-text-secondary">{job.cancelBlockedReason}</p>
                  ) : null}

                  {job.status === 'selesai' && job.cancelable ? (
                    konfirmasiJobId === job.id ? (
                      <div className="flex flex-col gap-2 rounded-control border border-danger bg-danger-surface p-3">
                        <p className="text-[0.9375rem] text-danger-ink">
                          Batalkan impor ini? {akibatPembatalan(job.kind)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="danger" onClick={() => void batalkan(job.id)} disabled={sibukBatal}>
                            {sibukBatal ? 'Membatalkan...' : 'Ya, batalkan impor'}
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setKonfirmasiJobId(null)}>
                            Jangan jadi
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Button type="button" variant="danger" onClick={() => setKonfirmasiJobId(job.id)}>
                          Batalkan impor
                        </Button>
                      </div>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {bolehImpor && jobs !== null && jobs.length < totalJobs ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => void muatRiwayat(jobs.length)} disabled={memuatRiwayat}>
                {memuatRiwayat ? 'Memuat...' : 'Muat riwayat lama'}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}

/**
 * Waktu pembuatan impor ditampilkan sebagai momen absolut. Tanggal bisnis seperti
 * tanggal jual atau tanggal bayar tetap memakai zona waktu workspace; riwayat
 * impor mencatat kapan berkasnya masuk, bukan tanggal usaha.
 */
function tanggalJam(iso: string): string {
  const waktu = new Date(iso)
  if (Number.isNaN(waktu.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(waktu)
}

/** Ringkasan akibat pembatalan per jenis impor, supaya pengguna tahu apa yang terjadi. */
function akibatPembatalan(kind: ImportJob['kind']): string {
  if (kind === 'produk') {
    return 'Barang hasil impor yang belum dipakai transaksi akan dihapus dari daftar stok.'
  }
  if (kind === 'supplier') {
    return 'Supplier hasil impor yang belum dipakai dokumen pembelian akan dihapus.'
  }
  if (kind === 'saldo_awal') {
    return 'Stok dari impor ini dikembalikan lewat transaksi pembalik, dan riwayat stok tetap utuh.'
  }
  return 'Penjualan hasil impor dibatalkan seperti pembatalan manual, dan stoknya kembali.'
}
