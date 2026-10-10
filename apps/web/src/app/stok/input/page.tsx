'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type LocationsResponse,
  type ProductSummary,
  type ProductsResponse,
} from '../../../lib/api'
import styles from '../stok.module.css'

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

export default function StockInputPage() {
  const app = useApp()

  const [mode, setMode] = useState<Mode>('masuk')
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [locations, setLocations] = useState<LocationsResponse['locations'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const [daftar, daftarLokasi] = await Promise.all([
        apiGet<ProductsResponse>(`/api/workspaces/${app.workspaceId}/products?limit=200&status=aktif`),
        apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`),
      ])

      if (berhenti) return

      if (!daftar.ok) {
        setLoadError(errorMessage(daftar.error, 'Daftar barang tidak bisa dimuat.'))
      } else {
        setProducts(daftar.data.products)
      }

      if (!daftarLokasi.ok) {
        setLoadError(errorMessage(daftarLokasi.error, 'Daftar lokasi tidak bisa dimuat.'))
      } else {
        const aktif = daftarLokasi.data.locations.filter((item) => !item.archived)
        setLocations(aktif)
        setLocationId(
          String(aktif.find((item) => item.isDefault)?.id ?? aktif[0]?.id ?? ''),
        )
      }

      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [app.workspaceId])

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

    const result = await apiPost<{ balanceAfter: number; replayed: boolean }>(
      `/api/workspaces/${app.workspaceId}/stock/movements`,
      {
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
      },
    )

    setBusy(false)

    if (!result.ok) {
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

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/input"
      breadcrumb="Stok"
      title="Catat stok"
    >
      {loadError ? <ErrorState title="Halaman ini belum siap" body={loadError} /> : null}

      {loading ? (
        <p role="status">Memuat daftar barang.</p>
      ) : (
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>Jenis catatan</legend>
            <div className={styles.segment}>
              {(['masuk', 'keluar'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={mode === item ? styles.segmentActive : styles.segmentButton}
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
              <div className={styles.segment}>
                {(['penyesuaian_naik', 'penyesuaian_turun'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={mode === item ? styles.segmentActive : styles.segmentButton}
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

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="produk">
              Barang
            </label>
            <select
              className={styles.select}
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

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="jumlah">
              Jumlah
            </label>
            <input
              className={styles.input}
              id="jumlah"
              name="jumlah"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              placeholder="Contoh: 12"
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="alasan">
              Alasan
            </label>
            <select
              className={styles.select}
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

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="harga-beli">
              Harga beli per satuan (opsional)
            </label>
            <input
              className={styles.input}
              id="harga-beli"
              name="harga-beli"
              inputMode="numeric"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              disabled={mode !== 'masuk'}
            />
            <p className={styles.hint}>
              Dipakai untuk menghitung harga pokok. Kosongkan kalau barang sudah punya harga
              rata-rata.
            </p>
          </div>

          {mode === 'masuk' ? (
            <div className={styles.filterGroup}>
              <label className={styles.label} htmlFor="kedaluwarsa">
                Tanggal kedaluwarsa (opsional)
              </label>
              <input
                className={styles.input}
                id="kedaluwarsa"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className={styles.hint}>
                Diisi untuk barang yang ada tanggal kedaluwarsanya, misalnya makanan dan
                minuman.
              </p>
            </div>
          ) : null}

          {mode === 'penyesuaian_naik' || mode === 'penyesuaian_turun' ? (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="referensi">
                  Nomor referensi atau dokumen
                </label>
                <input
                  className={styles.input}
                  id="referensi"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Contoh: nota gudang No. 12"
                />
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.label} htmlFor="catatan">
                  Keterangan
                </label>
                <input
                  className={styles.input}
                  id="catatan"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Apa yang sebenarnya terjadi"
                />
              </div>
            </>
          ) : null}

          <div className={styles.filterGroup}>
            <span className={styles.label}>
              Lokasi: {(locations ?? []).find((item) => String(item.id) === locationId)?.name ?? 'Belum ada lokasi'}
            </span>
            {showLocation ? (
              <select
                className={styles.select}
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
                className={styles.textButton}
                onClick={() => setShowLocation(true)}
              >
                Ganti lokasi
              </button>
            )}
          </div>

          <button
            type="submit"
            className={styles.submit}
            disabled={busy || productId === '' || quantity === '' || locationId === ''}
          >
            {busy ? 'Menyimpan' : 'Simpan catatan stok'}
          </button>
        </form>
      )}
    </AppShell>
  )
}

/**
 * Kunci idempotensi supaya catatan yang terkirim dua kali, misalnya karena sinyal
 * hilang lalu user menekan ulang, tidak menggandakan stok (PRD 10).
 */
function kunciIdempotensi(): string {
  const acak = Math.random().toString(36).slice(2)
  return `stok-${Date.now().toString(36)}-${acak}`
}
