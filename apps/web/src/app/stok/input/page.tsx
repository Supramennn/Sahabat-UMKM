'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import {
  apiGet,
  errorMessage,
  type LocationsResponse,
  type ProductSummary,
  type ProductsResponse,
} from '../../../lib/api'
import {
  bacaAntreanStok,
  bacaDaftar,
  hapusCatatanAntrean,
  kirimAntreanStok,
  kirimCatatanStok,
  labelSalinan,
  simpanDaftar,
  tambahCatatanStok,
  type EntriAntreanStok,
  type PayloadStokOffline,
} from '../../../lib/offline'
import { cx } from '../../../lib/cx'

/**
 * PRD 10: form input stok di ponsel maksimal tiga isian terlihat tanpa menggulir,
 * yaitu produk, jumlah, dan alasan. Lokasi pakai lokasi bawaan dan baru dibuka
 * lewat tombol Ganti, supaya tiga isian itu tetap muat di layar pertama.
 *
 * Referensi dan catatan hanya muncul untuk penyesuaian, karena barang masuk dan
 * keluar umumnya tidak punya nomor dokumen, sedangkan koreksi selalu perlu alasan
 * yang bisa ditelusuri.
 *
 * Bidang angka memakai inputMode numeric supaya papan angka muncul di ponsel, dan
 * tidak ada daftar panjang yang menutupi keyboard.
 *
 * Saat sinyal hilang, halaman yang sudah dibuka tetap bisa dipakai: daftar barang
 * dan lokasi dibaca dari salinan terakhir yang berhasil dimuat, dan isian yang
 * ditolak jaringan masuk antrean (PRD 10). Entri antrean tidak pernah dianggap
 * tersimpan sebelum server menjawab; balasan jaringan tetap berstatus menunggu.
 */

const REASONS = [
  { value: 'pembelian', label: 'Pembelian' },
  { value: 'penjualan', label: 'Penjualan' },
  { value: 'retur_pembelian', label: 'Retur pembelian' },
  { value: 'rusak', label: 'Rusak' },
  { value: 'kadaluwarsa', label: 'Kedaluwarsa' },
  { value: 'hilang', label: 'Hilang' },
  { value: 'salah_catat', label: 'Salah catat' },
] as const

type Mode = 'masuk' | 'keluar' | 'penyesuaian_naik' | 'penyesuaian_turun'

const MODE_LABEL: Record<Mode, string> = {
  masuk: 'Stok masuk',
  keluar: 'Stok keluar',
  penyesuaian_naik: 'Penyesuaian naik',
  penyesuaian_turun: 'Penyesuaian turun',
}

const ALASAN_PENYESUAIAN = ['rusak', 'kadaluwarsa', 'hilang', 'salah_catat'] as const

const BADGE_ANTREAN = 'inline-flex items-center self-start rounded-badge border px-2 py-0.5 text-xs font-medium'
const TOMBOL_SIMPAN = 'inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'

const waktuPendek = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

export default function StockInputPage() {
  const app = useApp()

  const [mode, setMode] = useState<Mode>('masuk')
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [locations, setLocations] = useState<LocationsResponse['locations'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [salinanLabel, setSalinanLabel] = useState<string | null>(null)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('pembelian')
  const [unitCost, setUnitCost] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [locationId, setLocationId] = useState('')
  const [showLocation, setShowLocation] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [antrean, setAntrean] = useState<EntriAntreanStok[]>([])
  const [busyAntrean, setBusyAntrean] = useState(false)

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const [daftar, daftarLokasi] = await Promise.all([
        apiGet<ProductsResponse>(`/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`),
        apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`),
      ])

      if (berhenti) return

      if (!daftar.ok) {
        // Halaman yang pernah dibuka tetap bisa dipakai saat offline (PRD 10):
        // daftar barang dibaca dari salinan terakhir yang berhasil dimuat.
        const salinan = bacaDaftar<ProductsResponse>({ workspaceId: app.workspaceId, kunci: 'produk' })
        if (salinan) {
          setProducts(salinan.data.products)
          setSalinanLabel(labelSalinan(salinan.disimpanPada))
        } else {
          setLoadError(errorMessage(daftar.error, 'Daftar barang tidak bisa dimuat.'))
        }
      } else {
        setProducts(daftar.data.products)
        simpanDaftar({ workspaceId: app.workspaceId, kunci: 'produk', data: daftar.data })
      }

      if (!daftarLokasi.ok) {
        const salinanLokasi = bacaDaftar<LocationsResponse>({ workspaceId: app.workspaceId, kunci: 'lokasi' })
        if (salinanLokasi) {
          const aktif = salinanLokasi.data.locations.filter((item) => !item.archived)
          setLocations(aktif)
          setLocationId((saatIni) => saatIni || String(aktif.find((item) => item.isDefault)?.id ?? aktif[0]?.id ?? ''))
          setSalinanLabel((sebelumnya) => sebelumnya ?? labelSalinan(salinanLokasi.disimpanPada))
        } else {
          setLoadError((sebelumnya) => sebelumnya ?? errorMessage(daftarLokasi.error, 'Daftar lokasi tidak bisa dimuat.'))
        }
      } else {
        const aktif = daftarLokasi.data.locations.filter((item) => !item.archived)
        setLocations(aktif)
        setLocationId(
          String(aktif.find((item) => item.isDefault)?.id ?? aktif[0]?.id ?? ''),
        )
        simpanDaftar({ workspaceId: app.workspaceId, kunci: 'lokasi', data: daftarLokasi.data })
      }

      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [app.workspaceId])

  const bacaAntreanLokal = useMemo(
    () => () => bacaAntreanStok().filter((entri) => entri.workspaceId === app.workspaceId),
    [app.workspaceId],
  )

  useEffect(() => {
    setAntrean(bacaAntreanLokal())
  }, [app.workspaceId, bacaAntreanLokal])

  const kirimUlang = useCallback(
    async (idTerpilih?: string) => {
      setBusyAntrean(true)
      const hasil = await kirimAntreanStok({
        workspaceId: app.workspaceId,
        idTerpilih,
        kirim: (entriPasang) => kirimCatatanStok(app.workspaceId, entriPasang),
      })
      setAntrean(bacaAntreanLokal())
      setBusyAntrean(false)

      if (hasil.terkirim > 0) {
        setError(null)
        setSuccess(`Terkirim ${hasil.terkirim} catatan dari antrean. Saldo dihitung ulang dari catatan server.`)
      } else if (hasil.ditolak > 0) {
        setError(`${hasil.ditolak} catatan ditolak server. Baca alasan pada setiap baris untuk memperbaikinya.`)
      }
    },
    [app.workspaceId, bacaAntreanLokal],
  )

  // Kirim ulang otomatis saat peramban menata ulang koneksi, dan sekali saat
  // halaman dibuka bila masih ada entri menunggu dari kunjungan sebelumnya.
  useEffect(() => {
    function cobaKirim() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (bacaAntreanLokal().some((entri) => entri.status === 'menunggu')) void kirimUlang()
    }
    cobaKirim()
    window.addEventListener('online', cobaKirim)
    return () => window.removeEventListener('online', cobaKirim)
  }, [app.workspaceId, bacaAntreanLokal, kirimUlang])

  const alasanUmum = useMemo(() => {
    if (mode === 'penyesuaian_naik' || mode === 'penyesuaian_turun') {
      return REASONS.filter((item) => (ALASAN_PENYESUAIAN as readonly string[]).includes(item.value))
    }
    return REASONS.slice(0, 2)
  }, [mode])

  const bolehMenyesuaikan = app.role === 'owner' || app.role === 'admin'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    const entri: PayloadStokOffline = {
      productId: Number(productId),
      locationId: Number(locationId),
      kind: mode,
      quantity,
      reasonCode: reason,
      unitCost: mode === 'masuk' && unitCost !== '' ? unitCost : undefined,
      reference: reference === '' ? null : reference,
      note: note === '' ? null : note,
      expiresAt: mode === 'masuk' && expiresAt !== '' ? expiresAt : null,
      idempotencyKey: kunciIdempotensi(),
    }

    const result = await kirimCatatanStok(app.workspaceId, entri)

    setBusy(false)

    if (!result.ok) {
      if (result.error.error === 'jaringan') {
        // PRD 10: tidak dianggap berhasil sebelum server mengonfirmasi. Isian
        // menunggu di antrean, bukan hilang, dan kuncinya ikut tersimpan supaya
        // kirim ulang tidak menggandakan stok (PRD 6.4, PRD 20).
        const baru = tambahCatatanStok({ workspaceId: app.workspaceId, payload: entri })
        setAntrean((sebelumnya) => [...sebelumnya, baru])
        setSuccess(null)
        setError('Sinyal tidak tersedia. Catatan masuk antrean dan mengubah saldo hanya setelah konfirmasi server.')
        return
      }
      setError(errorMessage(result.error, 'Stok tidak bisa dicatat.'))
      return
    }

    setSuccess(
      result.data.replayed
        ? 'Catatan ini sudah pernah tersimpan, jadi stok tidak digandakan.'
        : `Tersimpan. Saldo sekarang ${result.data.balanceAfter}.`,
    )
    setQuantity('')
  }

  function buangAntrean(id: string) {
    hapusCatatanAntrean(id)
    setAntrean((sebelumnya) => sebelumnya.filter((entri) => entri.id !== id))
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/input"
      breadcrumb="Stok"
      title="Catat stok"
    >
      {loadError ? <ErrorState title="Halaman ini belum siap" body={loadError} /> : null}

      {salinanLabel && !loadError ? (
        <p className="rounded-surface border border-warning bg-surface p-3 text-[0.9375rem] text-text-secondary shadow-raised" role="status">
          Halaman ini tidak bisa menghubungi server untuk daftar terbaru. Daftar barang dan lokasi di bawah diambil dari salinan {salinanLabel}.
        </p>
      ) : null}

      {loading ? (
        <p role="status">Memuat daftar barang.</p>
      ) : (
        <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit} noValidate>
          <fieldset>
            <legend className="text-[0.9375rem] font-medium text-text-primary">Jenis catatan</legend>
            <div className="flex gap-1">
              {(['masuk', 'keluar'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cx(
                    'flex-1 min-h-touch cursor-pointer rounded-control border px-3 text-base transition-colors duration-150',
                    mode === item
                      ? 'border-primary bg-primary font-semibold text-surface'
                      : 'border-border-strong bg-surface text-text-primary hover:border-text-secondary',
                  )}
                  aria-pressed={mode === item}
                  onClick={() => {
                    setMode(item)
                    setReason(item === 'masuk' ? 'pembelian' : 'penjualan')
                    setReference('')
                    setNote('')
                  }}
                >
                  {MODE_LABEL[item]}
                </button>
              ))}
            </div>
            {bolehMenyesuaikan ? (
              <div className="flex gap-1">
                {(['penyesuaian_naik', 'penyesuaian_turun'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cx(
                      'flex-1 min-h-touch cursor-pointer rounded-control border px-3 text-base transition-colors duration-150',
                      mode === item
                        ? 'border-primary bg-primary font-semibold text-surface'
                        : 'border-border-strong bg-surface text-text-primary hover:border-text-secondary',
                    )}
                    aria-pressed={mode === item}
                    onClick={() => {
                      setMode(item)
                      setReason('rusak')
                      setReference('')
                      setNote('')
                    }}
                  >
                    {MODE_LABEL[item]}
                  </button>
                ))}
              </div>
            ) : null}
          </fieldset>

          {error ? <Alert kind="error">{error}</Alert> : null}
          {success ? <Alert kind="success">{success}</Alert> : null}

          <div className="flex flex-col gap-1">
            <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="produk">
              Barang
            </label>
            <select
              className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
              id="produk"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              required
            >
              <option value="">Pilih barang</option>
              {(products ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="jumlah">
              Jumlah
            </label>
            <input
              className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
              id="jumlah"
              name="jumlah"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              placeholder="Contoh: 12"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="alasan">
              Alasan
            </label>
            <select
              className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
              id="alasan"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {alasanUmum.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="harga-beli">
              Harga beli per satuan (opsional)
            </label>
            <input
              className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
              id="harga-beli"
              name="harga-beli"
              inputMode="numeric"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              disabled={mode !== 'masuk'}
            />
            <p className="text-sm text-text-secondary">
              Dipakai untuk menghitung harga pokok. Kosongkan kalau barang sudah punya harga
              rata-rata.
            </p>
          </div>

          {mode === 'masuk' ? (
            <div className="flex flex-col gap-1">
              <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="kedaluwarsa">
                Tanggal kedaluwarsa (opsional)
              </label>
              <input
                className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                id="kedaluwarsa"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-sm text-text-secondary">
                Diisi untuk barang yang ada tanggal kedaluwarsanya, misalnya makanan dan
                minuman.
              </p>
            </div>
          ) : null}

          {mode === 'penyesuaian_naik' || mode === 'penyesuaian_turun' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="referensi">
                  Nomor referensi atau dokumen
                </label>
                <input
                  className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                  id="referensi"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Contoh: nota gudang No. 12"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor="catatan">
                  Keterangan
                </label>
                <input
                  className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                  id="catatan"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Apa yang sebenarnya terjadi"
                />
              </div>
            </>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-[0.9375rem] font-medium text-text-primary">
              Lokasi: {(locations ?? []).find((item) => String(item.id) === locationId)?.name ?? 'Belum ada lokasi'}
            </span>
            {showLocation ? (
              <select
                className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                id="lokasi"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                {(locations ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.isDefault ? ' (bawaan)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                className="min-h-touch self-start cursor-pointer bg-transparent px-2 text-left text-[0.9375rem] text-secondary underline enabled:hover:decoration-2 disabled:cursor-not-allowed disabled:text-text-secondary"
                onClick={() => setShowLocation(true)}
              >
                Ganti lokasi
              </button>
            )}
          </div>

          <button
            type="submit"
            className={TOMBOL_SIMPAN}
            disabled={busy || productId === '' || quantity === '' || locationId === ''}
          >
            {busy ? 'Menyimpan' : 'Simpan catatan stok'}
          </button>
        </form>
      )}

      {antrean.length > 0 ? (
        <section
          aria-labelledby="judul-antrean"
          className="flex max-w-[34rem] flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
        >
          <h2 className="text-lg font-semibold" id="judul-antrean">
            Antrean offline
          </h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Catatan berikut belum tersimpan di server dan belum mengubah saldo, berapa pun jumlah
            yang tercantum. Kirim ulang saat koneksi kembali.
          </p>
          <ul className="flex flex-col">
            {antrean.map((entri) => (
              <li key={entri.id} className="flex flex-col gap-1 border-t border-border-subtle py-2 first:border-t-0 first:pb-2 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[0.9375rem]">{labelEntri(entri, products)}</strong>
                  <span className={`${BADGE_ANTREAN} ${entri.status === 'menunggu' ? 'border-warning text-warning' : 'border-danger text-danger'}`}>
                    {entri.status === 'menunggu' ? 'Menunggu koneksi' : 'Gagal dikirim'}
                  </span>
                  <span className="text-sm text-text-secondary tabular">{waktuPendek.format(new Date(entri.createdAt))}</span>
                </div>
                {entri.status === 'gagal' && entri.pesanGagal ? (
                  <p className="text-sm text-danger" role="alert">
                    {entri.pesanGagal}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {entri.status === 'menunggu' ? (
                    <button
                      type="button"
                      className="min-h-touch self-start cursor-pointer bg-transparent px-0 text-left text-[0.9375rem] font-medium text-secondary underline enabled:hover:decoration-2"
                      disabled={busyAntrean}
                      onClick={() => void kirimUlang(entri.id)}
                    >
                      {busyAntrean ? 'Mengirim' : 'Kirim sekarang'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="min-h-touch self-start cursor-pointer bg-transparent px-0 text-left text-[0.9375rem] text-secondary underline enabled:hover:decoration-2"
                    onClick={() => buangAntrean(entri.id)}
                  >
                    Hapus dari antrean
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {antrean.some((entri) => entri.status === 'menunggu') ? (
            <button type="button" className={TOMBOL_SIMPAN} disabled={busyAntrean} onClick={() => void kirimUlang()}>
              {busyAntrean ? 'Mengirim antrean' : 'Kirim ulang semua antrean'}
            </button>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  )
}

function labelEntri(entri: EntriAntreanStok, products: ProductSummary[] | null): string {
  const namaBarang = products?.find((product) => product.id === entri.payload.productId)?.name ?? `ID barang ${entri.payload.productId}`
  return `${MODE_LABEL[entri.payload.kind]} ${entri.payload.quantity} (${namaBarang})`
}

/**
 * Kunci idempotensi supaya catatan yang terkirim dua kali, misalnya karena sinyal
 * hilang lalu antrean dikirim ulang, tidak menggandakan stok (PRD 10). Kuncinya
 * ikut tersimpan bersama entri antrean di lib/offline.
 */
function kunciIdempotensi(): string {
  const acak = Math.random().toString(36).slice(2)
  return `stok-${Date.now().toString(36)}-${acak}`
}
