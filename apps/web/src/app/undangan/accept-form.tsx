'use client'

import { useEffect, useState } from 'react'
import {
  Alert,
  AuthCard,
  AuthLink,
  AuthLinkRow,
  AuthShell,
  Button,
} from '../components/ui'
import { apiGet, apiPost, errorMessage, type SessionResponse } from '../../lib/api'

/**
 * PRD 6.1: undangan diterima lewat tautan sekali pakai dari email. Penerima harus
 * masuk dengan email yang diundang, karena server mencocokkan keduanya.
 */
export default function AcceptInvitationForm({ token }: { token: string }) {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notLoggedIn, setNotLoggedIn] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextPath = `/undangan?token=${encodeURIComponent(token)}`

  useEffect(() => {
    let berhenti = false

    async function muat() {
      const result = await apiGet<SessionResponse>('/api/auth/session')
      if (berhenti) return

      if (!result.ok) {
        if (result.error.error === 'belum_masuk') {
          setNotLoggedIn(true)
        } else {
          setLoadError(errorMessage(result.error, 'Data akun tidak bisa dimuat.'))
        }
      } else {
        setSession(result.data)
      }
      setLoading(false)
    }

    void muat()
    return () => {
      berhenti = true
    }
  }, [])

  async function terima() {
    setBusy(true)
    setError(null)

    const accepted = await apiPost<{ workspaceId: number; role: string }>(
      '/api/invitations/accept',
      { token },
    )

    if (!accepted.ok) {
      setBusy(false)
      setError(errorMessage(accepted.error, 'Undangan tidak bisa diterima.'))
      return
    }

    // Undangan sudah sah. Usaha yang baru dimasuki dijadikan usaha aktif supaya
    // penerima langsung membuka datanya, bukan usaha lamanya.
    const switched = await apiPost('/api/auth/switch-workspace', {
      workspaceId: accepted.data.workspaceId,
    })

    if (!switched.ok) {
      setBusy(false)
      setError(
        'Undangan sudah diterima, tetapi usaha belum bisa dibuka. Buka lewat pemilih usaha di bilah atas.',
      )
      return
    }

    window.location.assign('/dashboard')
  }

  return (
    <AuthShell>
      <AuthCard
        title="Terima undangan"
        subtitle="Bergabung ke usaha yang sudah mengundang Anda di Sahabat UMKM."
      >
        {loading ? <p role="status">Memuat data akun.</p> : null}

        {!loading && token === '' ? (
          <Alert kind="error">
            Tautan undangan tidak lengkap. Buka tautan yang ada di email undangan.
          </Alert>
        ) : null}

        {notLoggedIn && token !== '' ? (
          <>
            <p className="text-[0.9375rem] text-text-secondary">
              Masuk dengan email yang menerima undangan, lalu buka lagi tautan ini dari email.
            </p>
            <AuthLinkRow>
              <AuthLink href={`/masuk?next=${encodeURIComponent(nextPath)}`}>Masuk</AuthLink>
              <AuthLink href="/buat-akun">Buat akun</AuthLink>
            </AuthLinkRow>
          </>
        ) : null}

        {loadError ? <Alert kind="error">{loadError}</Alert> : null}

        {session && token !== '' ? (
          <>
            {error ? <Alert kind="error">{error}</Alert> : null}
            <p className="text-[0.9375rem] text-text-secondary">
              Undangan ini ditujukan untuk <span className="font-medium text-text-primary">{session.user.email}</span>.
            </p>
            <Button type="button" full disabled={busy} onClick={terima}>
              {busy ? 'Menerima undangan...' : 'Terima undangan'}
            </Button>
            <AuthLink href="/dashboard">Batal, kembali ke dashboard</AuthLink>
          </>
        ) : null}
      </AuthCard>
    </AuthShell>
  )
}
