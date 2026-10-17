'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../../components/app-context'
import { Alert, ErrorState } from '../../../components/ui'
import { API_BASE, apiGet, apiPost, errorMessage, type PurchaseOrderDetail } from '../../../../lib/api'
import { PurchasingShell } from '../../pembelian-shell'
import { badgeFor, rupiah } from '../../bagian'

/**
 * Detail satu PO (PRD 6.3).
 *
 * Halaman ini adalah tempat semua alur status terlihat: diajukan, disetujui atau
 * ditolak, dibatalkan, ditutup, dicatatnya penerimaan bertahap, diunduhnya PDF, dan
 * dibagikan lewat tautan baca-saja.
 *
 * Setiap aksi yang mengubah status atau mencabut tautan meminta konfirmasi yang
 * menyebut objeknya, karena keduanya meninggalkan jejak yang tidak bisa dihapus.
 */

const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const ACTIONS = 'flex flex-wrap gap-2'
const GROUP = 'flex min-w-0 flex-[1_1_12rem] flex-col gap-1'
const LABEL = 'text-[0.9375rem] font-medium text-text-primary'
const INPUT = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary'
const LINK_BUTTON = 'inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary'
const PRIMARY_BUTTON = 'min-h-touch cursor-pointer rounded-control bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'
const SECONDARY_BUTTON = 'min-h-touch cursor-pointer rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'

interface ShareStatus {
  active: boolean
  expiresOn: string
  revoked: boolean
  openCount: number
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const app = useApp()

  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [share, setShare] = useState<ShareStatus | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [emailTujuan, setEmailTujuan] = useState('')

  useEffect(() => {
    void params.then(({ id }) => setOrderId(id))
  }, [params])

  const load = useCallback(async () => {
    if (orderId === '') return
    const [hasil, statusShare] = await Promise.all([
      apiGet<PurchaseOrderDetail>(`/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}`),
      apiGet<{ share: ShareStatus | null }>(
        `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}/share`,
      ),
    ])

    if (hasil.ok) {
      setDetail(hasil.data)
      setError(null)
    } else {
      setError(errorMessage(hasil.error, 'PO tidak bisa dimuat.'))
    }

    if (statusShare.ok) setShare(statusShare.data.share)
    setLoading(false)
  }, [app.workspaceId, orderId])

  useEffect(() => {
    void load()
  }, [load])

  async function aksi(path: string, successMessage: string, konfirmasi?: string) {
    if (konfirmasi && !window.confirm(konfirmasi)) {
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}/${path}`,
      {},
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Tindakan itu tidak bisa dijalankan.'))
      return
    }

    setMessage(successMessage)
    await load()
  }

  async function buatTautan() {
    const kirim =
      emailTujuan.trim() === ''
        ? undefined
        : window.confirm(
            `Kirim tautan ke ${emailTujuan.trim()}? Tautan hanya berlaku terbatas dan bisa dicabut kapan saja.`,
          )

    if (emailTujuan.trim() !== '' && !kirim) {
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ url: string; expiresOn: string; emailed: boolean }>(
      `/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}/share`,
      emailTujuan.trim() === '' ? {} : { sendTo: emailTujuan.trim() },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Tautan tidak bisa dibuat.'))
      return
    }

    setShareUrl(result.data.url)
    setMessage(
      result.data.emailed
        ? `Tautan sudah dibuat dan dikirim ke ${emailTujuan.trim()}. Berlaku sampai ${result.data.expiresOn}.`
        : `Tautan sudah dibuat. Berlaku sampai ${result.data.expiresOn}.`,
    )
    await load()
  }

  async function salinTautan() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setMessage('Tautan disalin ke papan klip.')
    } catch {
      setError('Peramban ini tidak mengizinkan penyalinan otomatis. Salin manual dari kotak tautan.')
    }
  }

  async function catatPenerimaan() {
    const belum = detail?.items.filter((item) => item.outstanding > 0) ?? []
    if (belum.length === 0) {
      setError('Tidak ada barang yang masih menunggu diterima.')
      return
    }

    const jawaban = window.prompt(
      `Berapa jumlah diterima untuk ${belum[0]!.productName}?\nSisa di PO: ${belum[0]!.outstanding} ${belum[0]!.unitCode}.`,
      String(belum[0]!.outstanding),
    )
    if (jawaban === null) return

    setBusy(true)
    setError(null)
    setMessage(null)

    const result = await apiPost<{ number: string }>(
      `/api/workspaces/${app.workspaceId}/goods-receipts`,
      {
        purchaseOrderId: orderId,
        items: [{ productId: belum[0]!.productId, quantity: jawaban }],
        idempotencyKey: `terima-${orderId}-${Date.now().toString(36)}`,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Penerimaan tidak bisa dicatat.'))
      return
    }

    setMessage(`Penerimaan ${result.data.number} tersimpan dan stok sudah bertambah.`)
    await load()
  }

  const status = detail?.order.status ?? 'draft'
  const pdfUrl = `${API_BASE}/api/workspaces/${app.workspaceId}/purchase-orders/${orderId}/pdf`

  return (
    <PurchasingShell
      activeHref="/pembelian/po"
      title={detail?.order.number ?? 'Purchase order'}
      actions={
        <a className={LINK_BUTTON} href={pdfUrl} target="_blank" rel="noreferrer">
          Unduh PDF
        </a>
      }
    >
      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat detail PO.
        </p>
      ) : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {!loading && !detail && !error ? (
        <ErrorState title="PO tidak ditemukan" body="Cek kembali tautan PO ini." />
      ) : null}

      {detail ? (
        <>
          <p className="text-sm text-text-secondary tabular">
            <span className={badgeFor(status)}>{detail.order.statusLabel}</span> ·{' '}
            {detail.order.supplierName} · {detail.order.locationName} · {detail.order.orderedOn}
          </p>

          <div className={ACTIONS}>
            {status === 'draft' ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busy}
                onClick={() => void aksi('submit', 'PO diajukan untuk persetujuan.')}
              >
                Ajukan untuk persetujuan
              </button>
            ) : null}

            {status === 'diajukan' ? (
              <>
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  disabled={busy}
                  onClick={() =>
                    void aksi(
                      'approve',
                      'PO disetujui.',
                      `Setujui PO ${detail.order.number} untuk ${detail.order.supplierName}?`,
                    )
                  }
                >
                  Setujui
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={busy}
                  onClick={() =>
                    void aksi(
                      'reject',
                      'PO ditolak.',
                      `Tolak PO ${detail.order.number}? Supplier perlu diberi tahu alasannya.`,
                    )
                  }
                >
                  Tolak
                </button>
              </>
            ) : null}

            {['disetujui', 'diterima_sebagian'].includes(status) ? (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busy}
                onClick={() => void catatPenerimaan()}
              >
                Catat penerimaan
              </button>
            ) : null}

            {['diterima', 'diterima_sebagian'].includes(status) ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy}
                onClick={() =>
                  void aksi(
                    'close',
                    'PO ditutup.',
                    `Tutup PO ${detail.order.number}? Barang yang belum datang tidak bisa dicatat setelah ini.`,
                  )
                }
              >
                Tutup PO
              </button>
            ) : null}

            {['draft', 'diajukan'].includes(status) ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy}
                onClick={() =>
                  void aksi(
                    'cancel',
                    'PO dibatalkan.',
                    `Batalkan PO ${detail.order.number}? Tindakan ini tercatat di jejak audit.`,
                  )
                }
              >
                Batalkan PO
              </button>
            ) : null}
          </div>

          <h2 className="text-lg font-semibold">Bagikan ke supplier</h2>
          <p className="text-sm text-text-secondary">
            Tautan ini hanya untuk dibaca. Supplier bisa melihat isi PO dan mengunduh PDF-nya,
            tetapi tidak bisa mengubah apa pun. Tautan berlaku 30 hari, bisa dicabut kapan
            saja, dan setiap pembukaan tercatat.
          </p>

          {share?.active ? (
            <p className="text-sm text-text-secondary tabular">
              Tautan aktif sampai {share.expiresOn}
              {share.openCount > 0 ? ` · sudah dibuka ${share.openCount} kali` : ' · belum dibuka'}
            </p>
          ) : null}
          {share && !share.active ? (
            <p className="text-sm text-text-secondary">
              Tautan sebelumnya sudah {share.revoked ? 'dicabut' : 'kedaluwarsa'}. Buat yang baru
              bila perlu dikirim lagi.
            </p>
          ) : null}

          <div className={GROUP}>
            <label className={LABEL} htmlFor="email-tujuan">
              Kirim juga ke email (opsional)
            </label>
            <input
              className={INPUT}
              id="email-tujuan"
              type="email"
              inputMode="email"
              value={emailTujuan}
              onChange={(event) => setEmailTujuan(event.target.value)}
              placeholder="pemasaran@supplier.com"
            />
          </div>

          <div className={ACTIONS}>
            <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void buatTautan()}>
              Buat tautan baca-saja
            </button>
            {share?.active ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy}
                onClick={() =>
                  void aksi(
                    'share/revoke',
                    'Tautan dicabut. Alamat lamanya tidak bisa dibuka lagi.',
                    `Cabut tautan PO ${detail.order.number}? Pemegang alamat lama langsung kehilangan akses.`,
                  )
                }
              >
                Cabut tautan
              </button>
            ) : null}
          </div>

          {shareUrl ? (
            <div className="grid gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
              <label className={LABEL} htmlFor="tautan">
                Tautan baca-saja
              </label>
              <input className={INPUT} id="tautan" readOnly value={shareUrl} />
              <button type="button" className={SECONDARY_BUTTON} onClick={() => void salinTautan()}>
                Salin tautan
              </button>
            </div>
          ) : null}

          <h2 className="text-lg font-semibold">Barang</h2>
          <ul className="flex flex-col gap-2">
            {detail.items.map((item) => (
              <li key={item.id} className={CARD}>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-primary">{item.productName}</span>
                  <span className="text-sm text-text-secondary tabular">{rupiah(item.lineTotal)}</span>
                </span>
                <span className="text-sm text-text-secondary tabular">
                  {item.quantity} {item.unitCode} × {rupiah(item.unitPrice)}
                  {item.discountAmount > 0 ? `, diskon ${rupiah(item.discountAmount)}` : ''}
                </span>
                <span className="text-sm text-text-secondary tabular">
                  Diterima {item.receivedQuantity} {item.unitCode} · sisa {item.outstanding}{' '}
                  {item.unitCode}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-text-secondary tabular">Total PO: {rupiah(detail.order.totalAmount)}</p>

          {detail.receipts.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Penerimaan</h2>
              <ul className="flex flex-col gap-2">
                {detail.receipts.map((receipt) => (
                  <li key={receipt.receiptId} className={CARD}>
                    <span className="font-semibold text-primary tabular">{receipt.number}</span>
                    <span className="text-sm text-text-secondary tabular">
                      {receipt.receivedOn} · dicatat {receipt.receivedByName}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {detail.revisions.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Riwayat revisi</h2>
              <ul className="flex flex-col gap-2">
                {detail.revisions.map((revision) => (
                  <li key={revision.revisionNumber} className={CARD}>
                    <span className="font-semibold text-primary tabular">Revisi {revision.revisionNumber}</span>
                    <span className="text-sm text-text-secondary">
                      {revision.reason} · diubah {revision.changedByName}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </PurchasingShell>
  )
}