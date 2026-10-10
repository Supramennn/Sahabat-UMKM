'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../../components/app-context'
import { AppShell } from '../../../components/shell'
import { Alert, ErrorState } from '../../../components/ui'
import { API_BASE, apiGet, apiPost, errorMessage, type ProductSummary } from '../../../../lib/api'
import { formatQty } from '../../bagian'
import styles from '../../stok.module.css'

/**
 * Detail satu barang: saldo per lokasi, tanggal kedaluwarsa paling awal dari
 * penerimaan yang masih bersaldo, dan foto barang (PRD 6.2).
 *
 * Nilai kedaluwarsa ikut tampil pada laporan dengan label yang jelas, karena 1.0
 * tidak mengalokasikan barang berdasarkan FEFO (A-05).
 */

interface ProductDetailResponse {
  product: ProductSummary
  balances: Array<{
    locationId: number
    locationName: string
    quantity: number
    earliestExpiry: string | null
  }>
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Foto dikirim sebagai data URL supaya API tidak perlu pustaka pengolah gambar
 * dan tidak perlu menyimpan berkas sementara di disk.
 */
function bacaSebagaiDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Berkas tidak bisa dibaca.'))
    reader.readAsDataURL(file)
  })
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = useApp()

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null)
  const [productId, setProductId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  async function muat() {
    const result = await apiGet<ProductDetailResponse>(
      `/api/workspaces/${app.workspaceId}/products/${productId}`,
    )
    if (result.ok) {
      setDetail(result.data)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Barang tidak bisa dimuat.'))
    }
    setLoading(false)
  }

  useEffect(() => {
    let berhenti = false

    async function awal() {
      const { id } = await params
      if (berhenti) return
      setProductId(id)
    }

    void awal()
    return () => {
      berhenti = true
    }
  }, [params])

  useEffect(() => {
    if (productId === '') return
    setLoading(true)
    void muat()
  }, [app.workspaceId, productId])

  async function unggahFoto(file: File) {
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoMessage('Foto harus berupa JPEG, PNG, atau WebP.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoMessage('Ukuran foto maksimal 2 MB. Perkecil dulu di ponsel.')
      return
    }

    setPhotoBusy(true)
    setPhotoMessage(null)

    const data = await bacaSebagaiDataUrl(file)
    const result = await apiPost<{ photoKey: string }>(
      `/api/workspaces/${app.workspaceId}/products/${productId}/photo`,
      { contentType: file.type, data },
    )

    setPhotoBusy(false)

    if (!result.ok) {
      setPhotoMessage(errorMessage(result.error, 'Foto tidak bisa diunggah.'))
      return
    }

    setPhotoMessage('Foto tersimpan.')
    await muat()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok"
      breadcrumb="Stok"
      title={detail?.product.name ?? 'Barang'}
    >
      {loading ? <p role="status">Memuat detail barang.</p> : null}

      {error ? <ErrorState title="Barang tidak ditemukan" body={error} /> : null}

      {detail ? (
        <>
          <p className={styles.cardMeta}>
            {detail.product.sku}
            {detail.product.categoryName ? ` · ${detail.product.categoryName}` : ''} · Status{' '}
            {detail.product.status}
          </p>

          <h2 className={styles.cardName}>Saldo per lokasi</h2>
          {detail.balances.length === 0 ? (
            <p className={styles.cardMeta}>
              Barang ini belum punya saldo. Catat stok masuk untuk menambahkannya.
            </p>
          ) : (
            <ul className={styles.list}>
              {detail.balances.map((balance) => (
                <li key={balance.locationId} className={styles.card}>
                  <span className={styles.cardRow}>
                    <span className={styles.cardName}>{balance.locationName}</span>
                    <span className={styles.quantity}>
                      {formatQty(balance.quantity)} {detail.product.unitCode}
                    </span>
                  </span>
                  <span className={styles.cardMeta}>
                    {balance.earliestExpiry
                      ? `Kedaluwarsa pertama ${balance.earliestExpiry}`
                      : 'Tanpa tanggal kedaluwarsa'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className={styles.cardName}>Foto barang</h2>
          {detail.product.photoKey ? (
            // Foto dilayani API, bukan direktori statis, karena pembacaannya harus
            // memeriksa keanggotaan workspace. Lebar dan tingginya ditetapkan supaya
            // tata letak tidak bergeser saat gambar dimuat.
            <img
              className={styles.photo}
              src={`${API_BASE}/api/workspaces/${app.workspaceId}/media/${encodeURIComponent(detail.product.photoKey)}`}
              alt={`Foto ${detail.product.name}`}
              width={320}
              height={240}
            />
          ) : (
            <p className={styles.cardMeta}>Belum ada foto untuk barang ini.</p>
          )}

          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="foto">
              {detail.product.photoKey ? 'Ganti foto' : 'Unggah foto'}
            </label>
            <input
              className={styles.input}
              id="foto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void unggahFoto(file)
              }}
            />
            <p className={styles.hint}>JPEG, PNG, atau WebP, maksimal 2 MB.</p>
          </div>

          {photoMessage ? (
            <Alert kind={photoMessage.includes('tersimpan') ? 'success' : 'error'}>
              {photoMessage}
            </Alert>
          ) : null}

          <h2 className={styles.cardName}>Harga</h2>
          <ul className={styles.list}>
            <li className={styles.card}>
              <span className={styles.cardMeta}>Harga pokok rata-rata bergerak</span>
              <span className={styles.quantity}>
                {formatQty(detail.product.averageCost)} per {detail.product.unitCode}
              </span>
            </li>
          </ul>
        </>
      ) : null}
    </AppShell>
  )
}
