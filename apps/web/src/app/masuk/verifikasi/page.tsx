'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthShell, Button, Field } from '../../components/ui'
import { apiPost, errorMessage, type MfaVerifyResponse } from '../../../lib/api'
import styles from './page.module.css'

/**
 * Langkah kedua saat masuk: kode dari aplikasi autentikator, atau kode pemulihan
 * kalau perangkat autentikator tidak tersedia.
 *
 * PRD 10: bidang angka memunculkan papan angka, jadi inputMode memakai numeric
 * dan autoComplete one-time-code supaya kode bisa diisi dari SMS atau aplikasi
 * tanpa menyalin manual.
 */
export default function MfaVerifyPage() {
  const router = useRouter()

  const [token, setToken] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tokenInvalid = token.length > 0 && !/^\d{6}$/.test(token)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const payload = useRecovery
      ? { token: '000000', recoveryCode }
      : { token }

    const result = await apiPost<MfaVerifyResponse>('/api/auth/mfa/verify', payload)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Kode itu tidak cocok.'))
      setBusy(false)
      return
    }

    router.push('/pengaturan/akun')
  }

  return (
    <AuthShell>
      <AuthCard
        title="Masukkan kode Anda"
        subtitle="Kode 6 angka dari aplikasi autentikator."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {useRecovery ? (
            <Field
              id="recoveryCode"
              label="Kode pemulihan"
              value={recoveryCode}
              onChange={setRecoveryCode}
              autoComplete="one-time-code"
              required
              disabled={busy}
              hint="Kode 10 karakter yang Anda simpan saat mengaktifkan verifikasi dua langkah. Setiap kode hanya berlaku satu kali."
            />
          ) : (
            <Field
              id="token"
              label="Kode 6 angka"
              value={token}
              onChange={setToken}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              disabled={busy}
              error={tokenInvalid ? 'Kode berisi 6 angka.' : undefined}
            />
          )}

          <Button type="submit" full disabled={busy || (useRecovery ? !recoveryCode : tokenInvalid)}>
            {busy ? 'Memeriksa' : 'Verifikasi'}
          </Button>
        </form>

        <div className={styles.actions}>
          <AuthLink href="/masuk">
            {useRecovery ? 'Kembali ke kode dari aplikasi' : 'Kembali ke halaman masuk'}
          </AuthLink>
        </div>

        {!useRecovery ? (
          <button
            className={styles.textButton}
            type="button"
            onClick={() => {
              setUseRecovery(true)
              setError(null)
            }}
          >
            Pakai kode pemulihan
          </button>
        ) : null}
      </AuthCard>
    </AuthShell>
  )
}
