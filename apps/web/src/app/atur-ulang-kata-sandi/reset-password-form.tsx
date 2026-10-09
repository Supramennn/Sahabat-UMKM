'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthShell, Button, Field } from '../components/ui'
import { apiPost, errorMessage } from '../../lib/api'
import styles from './page.module.css'

/**
 * PRD 6.1: atur ulang kata sandi memakai token dari email. Token sudah dibaca
 * di server, jadi halaman ini memeriksa apakah tokennya ada sebelum menampilkan
 * isian.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < 12

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<{ message: string }>('/api/auth/reset-password', { token, password })

    if (!result.ok) {
      setError(errorMessage(result.error, 'Tautan tidak berlaku atau sudah dipakai.'))
      setBusy(false)
      return
    }

    router.push('/masuk?kata-sandi-diubah=1')
  }

  if (!token) {
    return (
      <AuthShell>
        <AuthCard title="Tautan tidak lengkap" subtitle="Buka tautan dari email yang kami kirim.">
          <Alert kind="error">
            Tautan ini tidak memuat token. Minta tautan baru dari halaman lupa kata sandi.
          </Alert>
          <AuthLink href="/lupa-kata-sandi">Minta tautan baru</AuthLink>
        </AuthCard>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthCard title="Buat kata sandi baru">
        {error ? <Alert kind="error">{error}</Alert> : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <Field
            id="password"
            label="Kata sandi baru"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            disabled={busy}
            hint="Minimal 12 karakter. Naik dari kata sandi lama Anda."
            error={tooShort ? 'Kata sandi masih kurang dari 12 karakter.' : undefined}
          />
          <Button type="submit" full disabled={busy || tooShort}>
            {busy ? 'Menyimpan' : 'Simpan kata sandi baru'}
          </Button>
        </form>

        <p className={styles.recoveryNote}>
          Setelah kata sandi diganti, semua perangkat dikeluarkan dari sesi.
        </p>
      </AuthCard>
    </AuthShell>
  )
}
