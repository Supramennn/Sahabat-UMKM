'use client'

import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthShell, Button, Field } from '../components/ui'
import { apiPost } from '../../lib/api'

/**
 * PRD 6.1: permintaan atur ulang kata sandi.
 *
 * Responsnya sama untuk email terdaftar maupun tidak, jadi halaman ini tidak
 * bisa dipakai untuk mencari tahu email mana yang punya akun (PRD 9).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<{ message: string }>('/api/auth/forgot-password', { email })

    if (!result.ok) {
      setError('Permintaan gagal. Coba lagi sebentar.')
      setBusy(false)
      return
    }

    setSent(true)
    setBusy(false)
  }

  return (
    <AuthShell>
      <AuthCard title="Atur ulang kata sandi" subtitle="Kami kirim tautan ke email Anda.">
        {sent ? (
          <div className="flex flex-col gap-4">
            <Alert kind="success">
              Jika email itu terdaftar, kami sudah mengirim tautan atur ulang kata sandi. Periksa
              kotak masuk dan folder spam.
            </Alert>
            <p className="text-[0.9375rem] text-text-secondary">
              Tautan berlaku 60 menit dan hanya bisa dipakai satu kali.
            </p>
            <AuthLink href="/masuk">Kembali ke halaman masuk</AuthLink>
          </div>
        ) : (
          <>
            {error ? <Alert kind="error">{error}</Alert> : null}
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              <Field
                id="email"
                label="Email"
                type="email"
                inputMode="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
                disabled={busy}
              />
              <Button type="submit" full disabled={busy}>
                {busy ? 'Mengirim' : 'Kirim tautan'}
              </Button>
            </form>
            <AuthLink href="/masuk">Kembali ke halaman masuk</AuthLink>
          </>
        )}
      </AuthCard>
    </AuthShell>
  )
}
