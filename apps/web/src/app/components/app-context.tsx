'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { roleLabels, type Role } from '@sahabat/shared'
import { apiGet, errorMessage, type SessionResponse, type UnreadCountResponse, type WorkspaceResponse } from '../../lib/api'
import { AuthLink, ErrorState } from './ui'

/**
 * Konteks aplikasi: sesi, workspace aktif, dan peran. Halaman di dalam modul stok
 * membacanya dari sini, bukan mengambil sendiri, supaya setiap halaman menampilkan
 * keadaan memuat dan galat dengan bentuk yang sama (PRD 10).
 */

export interface AppContextValue {
  workspaceId: number
  workspaceName: string
  workspaces: SessionResponse['workspaces']
  renameWorkspace: (name: string) => void
  role: Role
  roleLabel: string
  userName: string
  /** Jumlah notifikasi yang belum dibaca di workspace aktif (PRD 6.9). */
  unreadCount: number | null
  /** Ambil ulang jumlah belum dibaca dari server setelah pengguna menandai dibaca. */
  refreshUnreadCount: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

type AppContextState = Omit<AppContextValue, 'renameWorkspace' | 'unreadCount' | 'refreshUnreadCount'>

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) {
    throw new Error('useApp harus dipakai di dalam AppProvider.')
  }
  return value
}

export function AppProvider({ children, title = 'Stok' }: { children: ReactNode; title?: string }) {
  const [context, setContext] = useState<AppContextState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tanpaWorkspace, setTanpaWorkspace] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const sesi = await apiGet<SessionResponse>('/api/auth/session')

      if (berhenti) return

      if (!sesi.ok) {
        setError(
          sesi.error.error === 'belum_masuk'
            ? 'Anda belum masuk.'
            : errorMessage(sesi.error),
        )
        setLoading(false)
        return
      }

      if (sesi.data.activeWorkspaceId === null) {
        setTanpaWorkspace(true)
        setError('Akun ini belum punya usaha. Buat usaha dulu supaya data stok dan penjualan punya tempat.')
        setLoading(false)
        return
      }

      const workspaceId = sesi.data.activeWorkspaceId
      const workspace = await apiGet<WorkspaceResponse>(
        `/api/workspaces/${workspaceId}`,
      )

      if (berhenti) return

      if (!workspace.ok) {
        setError(errorMessage(workspace.error))
        setLoading(false)
        return
      }

      const role = workspace.data.role as Role
      setContext({
        workspaceId,
        workspaceName: workspace.data.workspace.name,
        workspaces: sesi.data.workspaces,
        role,
        roleLabel: roleLabels[role] ?? role,
        userName: sesi.data.user.name,
      })
      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [])

  function renameWorkspace(name: string) {
    setContext((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        workspaceName: name,
        workspaces: previous.workspaces.map((workspace) =>
          workspace.id === previous.workspaceId ? { ...workspace, name } : workspace,
        ),
      }
    })
  }

  // Jumlah notifikasi belum dibaca dimuat setelah workspace diketahui, dan bisa
  // disegarkan halaman notifikasi setelah pengguna menandai sesuatu dibaca
  // (PRD 6.9). Kegagalan memuat diabaikan: hitungan ini pelengkap, bukan syarat
  // halaman bisa dipakai.
  const workspaceId = context?.workspaceId
  const refreshUnreadCount = useCallback(async () => {
    if (workspaceId === undefined) return
    const hasil = await apiGet<UnreadCountResponse>(
      `/api/workspaces/${workspaceId}/notifications/unread-count`,
    )
    if (hasil.ok) {
      setUnreadCount(hasil.data.unreadCount)
    }
  }, [workspaceId])

  useEffect(() => {
    void refreshUnreadCount()
  }, [refreshUnreadCount])

  // PRD 10: judul utama harus ada di setiap keadaan halaman, termasuk saat memuat
  // dan saat gagal. Tanpa itu, pembaca layar dan mesin pencari tidak tahu halaman
  // ini tentang apa. Judulnya milik halaman pemanggil, bukan selalu "Stok".
  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p role="status">Memuat data workspace.</p>
      </div>
    )
  }

  if (error || !context) {
    return (
      <div className="flex flex-col gap-3 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <ErrorState
          title="Halaman ini belum bisa dibuka"
          body={error ?? 'Workspace tidak ditemukan.'}
          action={
            <AuthLink href={tanpaWorkspace ? '/buat-usaha' : '/masuk'}>
              {tanpaWorkspace ? 'Buat usaha' : 'Buka halaman masuk'}
            </AuthLink>
          }
        />
      </div>
    )
  }

  return (
    <AppContext.Provider value={{ ...context, renameWorkspace, unreadCount, refreshUnreadCount }}>
      {children}
    </AppContext.Provider>
  )
}
