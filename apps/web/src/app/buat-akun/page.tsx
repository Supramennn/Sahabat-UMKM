'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AuthCard, AuthLink, AuthLinkRow, AuthShell, Button, Field } from '../components/ui'
import { apiPost, errorMessage } from '../../lib/api'

/**
 * PRD 6.1: daftar dengan email dan kata sandi, lalu verifikasi email.
 *
 * Respons pendaftaran sengaja tidak membuka apakah email itu sudah dipakai, jadi
 * halaman ini menampilkan pesan yang sama baik pun kondisinya.
 */
export default function RegisterPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < 12

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<{ message: string }>('/api/auth/register', { name, email, password })

    if (!result.ok) {
      setError(errorMessage(result.error, 'Pendaftaran gagal. Periksa kembali isian Anda.'))
      setBusy(false)
      return
    }

    router.push('/masuk?terdaftar=1')
  }

  return (
    <AuthShell>
      <AuthCard
        title="Buat akun"
        subtitle="Gratis. Tidak perlu kartu, dan data bisa diekspor kapan saja."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field
            id="name"
            label="Nama"
            value={name}
            onChange={setName}
            autoComplete="name"
            required
            disabled={busy}
          />
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
            autoComplete="new-password"
            required
            disabled={busy}
            hint="Minimal 12 karakter. Kalimat yang Anda ingat sendiri lebih mudah dijaga daripada gabungan angka dan simbol."
            error={tooShort ? 'Kata sandi masih kurang dari 12 karakter.' : undefined}
          />
          <Button type="submit" full disabled={busy || tooShort}>
            {busy ? 'Membuat akun' : 'Buat akun'}
          </Button>
        </form>

        <AuthLinkRow>
          <AuthLink href="/masuk">Sudah punya akun</AuthLink>
        </AuthLinkRow>
      </AuthCard>
    </AuthShell>
  )
}
