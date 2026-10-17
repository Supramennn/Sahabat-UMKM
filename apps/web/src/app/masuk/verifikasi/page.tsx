'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthShell, Button, Field } from '../../components/ui'
import { apiPost, errorMessage, type MfaVerifyResponse } from '../../../lib/api'

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

    router.push('/dashboard')
  }

  return (
    <AuthShell>
      <AuthCard
        title="Masukkan kode Anda"
        subtitle="Kode 6 angka dari aplikasi autentikator."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
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

        <div className="flex flex-col gap-2 min-[30rem]:flex-row min-[30rem]:flex-wrap">
          <AuthLink href="/masuk">
            {useRecovery ? 'Kembali ke kode dari aplikasi' : 'Kembali ke halaman masuk'}
          </AuthLink>
        </div>

        {!useRecovery ? (
          <button
            className="min-h-touch self-start cursor-pointer bg-transparent px-2 text-left text-[0.9375rem] text-secondary underline enabled:hover:decoration-2 disabled:cursor-not-allowed disabled:text-text-secondary"
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
