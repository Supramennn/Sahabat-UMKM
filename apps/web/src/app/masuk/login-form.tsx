'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthLinkRow, AuthShell, Button, Field } from '../components/ui'
import { apiPost, errorMessage, type LoginResponse, type MessageResponse } from '../../lib/api'
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
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [busy, setBusy] = useState(false)

  // Hanya path internal yang diterima, supaya next yang berasal dari tautan luar
  // tidak bisa mengarahkan pengguna ke situs lain.
  const destination = nextPath.startsWith('/') && !nextPath.startsWith('//')
    ? nextPath
    : '/dashboard'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNeedsVerification(false)
    setResendMessage(null)

    const result = await apiPost<LoginResponse>('/api/auth/login', { email, password })

    if (!result.ok) {
      // PRD 6.1: masuk ditolak sebelum email diverifikasi. Halaman ini lalu
      // menawarkan jalan keluar, yaitu meminta tautan baru.
      if (result.error.error === 'email_belum_diverifikasi') {
        setNeedsVerification(true)
      }
      setError(errorMessage(result.error, 'Email atau kata sandi salah.'))
      setBusy(false)
      return
    }

    if (result.data.mfaRequired) {
      router.push('/masuk/verifikasi')
      return
    }

    // PRD 9: Owner dan Admin wajib memakai verifikasi dua langkah setelah 30
    // hari. Sesi sudah terbit, tapi data workspace masih terkunci sampai MFA
    // diaktifkan, jadi langsung ke pengaturan akun.
    if (result.data.mfaSetupRequired) {
      router.push('/pengaturan/akun')
      return
    }

    router.push(destination)
  }

  async function resendVerification() {
    setResending(true)
    setResendMessage(null)

    const result = await apiPost<MessageResponse>('/api/auth/resend-verification', { email })

    // Pesannya sama untuk email terdaftar maupun tidak, jadi yang ditampilkan
    // juga sama (PRD 9).
    setResendMessage(
      result.ok
        ? result.data.message
        : 'Permintaan gagal terkirim. Coba lagi beberapa saat lagi.',
    )
    setResending(false)
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
        {resendMessage ? <Alert kind="info">{resendMessage}</Alert> : null}

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

        {needsVerification ? (
          <p className={styles.actions}>
            <button
              type="button"
              className={styles.textButton}
              onClick={resendVerification}
              disabled={resending || email.trim() === ''}
            >
              {resending ? 'Mengirim' : 'Kirim ulang tautan verifikasi'}
            </button>
          </p>
        ) : null}

        <AuthLinkRow>
          <AuthLink href="/lupa-kata-sandi">Lupa kata sandi</AuthLink>
          <AuthLink href="/buat-akun">Buat akun</AuthLink>
        </AuthLinkRow>
      </AuthCard>
    </AuthShell>
  )
}
