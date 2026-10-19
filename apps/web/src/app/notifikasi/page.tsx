'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppProvider, useApp } from '../components/app-context'
import { AppShell } from '../components/shell'
import { Alert, Button, CheckboxField, ErrorState } from '../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type MessageResponse,
  type NotificationItem,
  type NotificationsResponse,
} from '../../lib/api'

/**
 * Daftar notifikasi PRD 6.9.
 *
 * Isinya berasal dari server dan sudah dibatasi ke pengguna yang sedang masuk,
 * jadi halaman ini tidak memfilter apa pun soal izin: yang tidak boleh dilihat
 * memang tidak pernah dikirim. Menandai dibaca juga diperiksa server, dan
 * hitungan di bilah atas disegarkan dari server supaya tidak pernah menampilkan
 * angka karangan halaman ini.
 */

const PAGE_SIZE = 20

const waktu = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export default function NotificationsPage() {
  return (
    <AppProvider title="Notifikasi">
      <NotificationsContent />
    </AppProvider>
  )
}

function NotificationsContent() {
  const app = useApp()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [hanyaBelumDibaca, setHanyaBelumDibaca] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(
    async (offset: number) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (hanyaBelumDibaca) {
        query.set('unread', '1')
      }

      const result = await apiGet<NotificationsResponse>(
        `/api/workspaces/${app.workspaceId}/notifications?${query.toString()}`,
      )

      if (!result.ok) {
        setLoadError(errorMessage(result.error, 'Daftar notifikasi tidak bisa dimuat.'))
        return
      }

      setLoadError(null)
      setTotal(result.data.total)
      setUnreadCount(result.data.unreadCount)
      setItems((sebelumnya) =>
        offset === 0 ? result.data.notifications : [...sebelumnya, ...result.data.notifications],
      )
    },
    [app.workspaceId, hanyaBelumDibaca],
  )

  useEffect(() => {
    setLoading(true)
    void load(0).finally(() => setLoading(false))
  }, [load])

  async function muatLagi() {
    setLoadingMore(true)
    await load(items.length)
    setLoadingMore(false)
  }

  async function tandaiDibaca(id: number) {
    setBusy(true)
    setMessage(null)
    setActionError(null)

    const result = await apiPost<MessageResponse | { marked: number }>(
      `/api/workspaces/${app.workspaceId}/notifications/read`,
      { ids: [id] },
    )

    if (!result.ok) {
      setBusy(false)
      setActionError(errorMessage(result.error, 'Pemberitahuan tidak bisa ditandai dibaca.'))
      return
    }

    setItems((sebelumnya) =>
      hanyaBelumDibaca
        ? sebelumnya.filter((item) => item.id !== id)
        : sebelumnya.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
    setUnreadCount((sebelumnya) => Math.max(0, sebelumnya - 1))
    setTotal((sebelumnya) => (hanyaBelumDibaca ? Math.max(0, sebelumnya - 1) : sebelumnya))
    setMessage('Pemberitahuan ditandai sudah dibaca.')
    await app.refreshUnreadCount()
    setBusy(false)
  }

  async function tandaiSemua() {
    setBusy(true)
    setMessage(null)
    setActionError(null)

    const result = await apiPost<MessageResponse | { marked: number }>(
      `/api/workspaces/${app.workspaceId}/notifications/read-all`,
    )

    if (!result.ok) {
      setBusy(false)
      setActionError(errorMessage(result.error, 'Pemberitahuan tidak bisa ditandai dibaca.'))
      return
    }

    setMessage('Semua pemberitahuan ditandai sudah dibaca.')
    await app.refreshUnreadCount()
    setUnreadCount(0)
    setBusy(false)
    if (hanyaBelumDibaca) {
      setItems([])
      setTotal(0)
    } else {
      setItems((sebelumnya) => sebelumnya.map((item) => ({ ...item, read: true })))
    }
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/notifikasi"
      breadcrumb="Beranda"
      title="Notifikasi"
    >
      {message ? <Alert kind="success">{message}</Alert> : null}
      {actionError ? <Alert kind="error">{actionError}</Alert> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <CheckboxField
          id="hanya-belum-dibaca"
          label="Hanya yang belum dibaca"
          checked={hanyaBelumDibaca}
          onChange={setHanyaBelumDibaca}
        />
        {unreadCount > 0 ? (
          <Button type="button" variant="secondary" onClick={() => void tandaiSemua()} disabled={busy}>
            Tandai semua dibaca
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <ErrorState
          title="Daftar notifikasi tidak bisa dimuat"
          body={loadError}
          action={
            <Button type="button" variant="secondary" onClick={() => void load(0)}>
              Coba lagi
            </Button>
          }
        />
      ) : null}

      {loading ? <p role="status">Memuat notifikasi.</p> : null}

      {!loading && !loadError && items.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold text-text-primary">
            {hanyaBelumDibaca ? 'Tidak ada yang belum dibaca.' : 'Belum ada pemberitahuan di usaha ini.'}
          </p>
          <p className="text-[0.9375rem] text-text-secondary">
            {hanyaBelumDibaca
              ? 'Matikan saringan di atas untuk melihat seluruh riwayat.'
              : 'Pemberitahuan tentang stok rendah, purchase order, utang supplier, undangan, dan keamanan akun muncul di sini.'}
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex list-none flex-col gap-3 p-0">
          {items.map((item) => (
            <li
              className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              key={item.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-badge border border-border-strong px-2 py-0.5 text-sm text-text-secondary">
                  {item.kindLabel}
                </span>
                {!item.read ? (
                  <span className="rounded-badge bg-primary px-2 py-0.5 text-sm font-semibold text-surface">
                    Belum dibaca
                  </span>
                ) : null}
                <span className="tabular text-sm text-text-secondary">{waktu(item.createdAt)}</span>
              </div>
              <p className="font-semibold text-text-primary">{item.title}</p>
              <p className="whitespace-pre-line text-[0.9375rem] text-text-secondary">{item.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                {item.href ? (
                  <a
                    className="inline-flex min-h-touch items-center text-secondary underline underline-offset-4 hover:text-secondary-deep"
                    href={item.href}
                  >
                    Buka
                  </a>
                ) : null}
                {!item.read ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void tandaiDibaca(item.id)}
                    disabled={busy}
                  >
                    Tandai dibaca
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 && items.length < total ? (
        <div>
          <Button type="button" variant="secondary" onClick={() => void muatLagi()} disabled={loadingMore}>
            {loadingMore ? 'Memuat...' : `Muat ${Math.min(PAGE_SIZE, total - items.length)} lagi`}
          </Button>
        </div>
      ) : null}
    </AppShell>
  )
}
