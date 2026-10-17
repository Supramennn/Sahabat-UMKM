'use client'

import { useState } from 'react'
import { Alert, AuthCard, AuthLink, AuthShell, Button } from '../components/ui'
import { apiPost, errorMessage } from '../../lib/api'

/**
 * PRD 6.1: verifikasi email. Tanpa halaman ini, akun yang baru mendaftar tidak
 * bisa masuk karena masuk menolak email yang belum diverifikasi.
 *
 * Tombol ditebak pengguna, bukan dikirim otomatis saat halaman dibuka, supaya
 * tautan yang sama tidak langsung habis dipakai saat email dibuka dua kali atau
 * saat pemindai antivirus membuka pratinjau tautan.
 */
export default function VerifyEmailForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)

  async function verify() {
    setBusy(true)
    setError(null)

    const result = await apiPost<{ verified: boolean }>('/api/auth/verify-email', { token })

    if (!result.ok) {
      setError(errorMessage(result.error, 'Tautan tidak berlaku atau sudah dipakai.'))
      setBusy(false)
      return
    }

    setVerified(true)
    setBusy(false)
  }

  if (!token) {
    return (
      <AuthShell>
        <AuthCard title="Tautan tidak lengkap" subtitle="Buka tautan dari email yang kami kirim.">
          <Alert kind="error">
            Tautan ini tidak memuat token. Minta tautan baru dari halaman masuk.
          </Alert>
          <AuthLink href="/masuk">Buka halaman masuk</AuthLink>
        </AuthCard>
      </AuthShell>
    )
  }

  if (verified) {
    return (
      <AuthShell>
        <AuthCard title="Email terverifikasi">
          <Alert kind="success">Email Anda sudah terverifikasi. Silakan masuk.</Alert>
          <AuthLink href="/masuk">Masuk sekarang</AuthLink>
        </AuthCard>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthCard title="Verifikasi email" subtitle="Satu langkah lagi sebelum Anda masuk.">
        {error ? <Alert kind="error">{error}</Alert> : null}

        <div className="flex flex-col gap-4">
          <Button onClick={verify} disabled={busy} full>
            {busy ? 'Memproses' : 'Verifikasi email saya'}
          </Button>
          <p className="text-[0.9375rem] text-text-secondary">
            Kalau tautan ini sudah tidak berlaku, minta tautan baru dari halaman masuk memakai email
            yang sama.
          </p>
          <AuthLink href="/masuk">Buka halaman masuk</AuthLink>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
