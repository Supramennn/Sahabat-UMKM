'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { roleLabels, type Role } from '@sahabat/shared'
import { apiGet, errorMessage, type SessionResponse, type WorkspaceResponse } from '../../lib/api'
import { AuthLink, ErrorState } from './ui'
import styles from './shell.module.css'

/**
 * Konteks aplikasi: sesi, workspace aktif, dan peran. Halaman di dalam modul stok
 * membacanya dari sini, bukan mengambil sendiri, supaya setiap halaman menampilkan
 * keadaan memuat dan galat dengan bentuk yang sama (PRD 10).
 */

export interface AppContextValue {
  workspaceId: number
  workspaceName: string
  role: Role
  roleLabel: string
  userName: string
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) {
    throw new Error('useApp harus dipakai di dalam AppProvider.')
  }
  return value
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AppContextValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
        setError('Akun ini belum punya workspace. Pilih atau buat workspace terlebih dulu.')
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

  // PRD 10: judul utama harus ada di setiap keadaan halaman, termasuk saat memuat
  // dan saat gagal. Tanpa itu, pembaca layar dan mesin pencari tidak tahu halaman
  // ini tentang apa.
  if (loading) {
    return (
      <div className={styles.loading}>
        <h1 className={styles.loadingTitle}>Stok</h1>
        <p role="status">Memuat data workspace.</p>
      </div>
    )
  }

  if (error || !context) {
    return (
      <div className={styles.loading}>
        <h1 className={styles.loadingTitle}>Stok</h1>
        <ErrorState
          title="Halaman ini belum bisa dibuka"
          body={error ?? 'Workspace tidak ditemukan.'}
          action={<AuthLink href="/masuk">Buka halaman masuk</AuthLink>}
        />
      </div>
    )
  }

  return <AppContext.Provider value={context}>{children}</AppContext.Provider>
}
