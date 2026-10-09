'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthLinkRow, AuthShell, Button, Field } from '../components/ui'
import { apiPost, errorMessage, type LoginResponse } from '../../lib/api'
import styles from './page.module.css'

/**
 * PRD 6.1: masuk. Kesalahan dan keadaan memuat ditangani di sini, dan tidak ada
 * yang disimpan di penyimpanan peramban karena token sesi sudah ada di cookie
 * HttpOnly.
 */
export default function LoginForm({
  nextPath,
  justRegistered,
  justReset,
}: {
  nextPath: string
  justRegistered: boolean
  justReset: boolean
}) {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Hanya path internal yang diterima, supaya next yang berasal dari tautan luar
  // tidak bisa mengarahkan pengguna ke situs lain.
  const destination = nextPath.startsWith('/') && !nextPath.startsWith('//')
    ? nextPath
    : '/pengaturan/akun'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<LoginResponse>('/api/auth/login', { email, password })

    if (!result.ok) {
      setError(errorMessage(result.error, 'Email atau kata sandi salah.'))
      setBusy(false)
      return
    }

    if (result.data.mfaRequired) {
      router.push('/masuk/verifikasi')
      return
    }

    router.push(destination)
  }

  return (
    <AuthShell>
      <AuthCard title="Masuk" subtitle="Catat stok, kelola pembelian, dan baca laporan usaha.">
        {justRegistered ? (
          <Alert kind="success">
            Akun dibuat. Periksa email Anda untuk verifikasi, lalu masuk di sini.
          </Alert>
        ) : null}
        {justReset ? (
          <Alert kind="success">
            Kata sandi sudah diperbarui. Silakan masuk dengan kata sandi baru.
          </Alert>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
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
          <Field
            id="password"
            label="Kata sandi"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
            disabled={busy}
          />
          <Button type="submit" full disabled={busy}>
            {busy ? 'Memproses' : 'Masuk'}
          </Button>
        </form>

        <AuthLinkRow>
          <AuthLink href="/lupa-kata-sandi">Lupa kata sandi</AuthLink>
          <AuthLink href="/buat-akun">Buat akun</AuthLink>
        </AuthLinkRow>
      </AuthCard>
    </AuthShell>
  )
}
