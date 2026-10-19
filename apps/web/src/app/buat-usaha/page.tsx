'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  Alert,
  AuthCard,
  AuthLink,
  AuthLinkRow,
  AuthShell,
  Button,
  Field,
  SelectField,
} from '../components/ui'
import { apiGet, apiPost, errorMessage, type SessionResponse } from '../../lib/api'
import { timezoneOptions } from '../../lib/workspace-options'

/**
 * PRD 6.1: akun tanpa workspace harus punya jalan untuk membuatnya. Halaman ini
 * juga dipakai pemilik yang sudah punya satu usaha lalu menambah usaha lain.
 */
export default function CreateWorkspacePage() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notLoggedIn, setNotLoggedIn] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [timezone, setTimezone] = useState('Asia/Jakarta')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await apiPost<{ workspaceId: number }>('/api/workspaces', {
      name: name.trim(),
      businessType: businessType.trim() || undefined,
      timezone,
    })

    if (!result.ok) {
      setBusy(false)
      setError(errorMessage(result.error, 'Usaha tidak bisa dibuat.'))
      return
    }

    // Server sudah menjadikan usaha baru sebagai usaha aktif di sesi. Muat ulang
    // penuh supaya semua halaman memakai data usaha itu.
    window.location.assign('/dashboard')
  }

  return (
    <AuthShell>
      <AuthCard
        title="Buat usaha"
        subtitle="Data stok, pembelian, dan penjualan disimpan di dalam satu usaha."
      >
        {loading ? <p role="status">Memuat data akun.</p> : null}

        {notLoggedIn ? (
          <>
            <p className="text-[0.9375rem] text-text-secondary">
              Masuk dulu sebelum membuat usaha.
            </p>
            <AuthLinkRow>
              <AuthLink href="/masuk?next=/buat-usaha">Masuk</AuthLink>
              <AuthLink href="/buat-akun">Buat akun</AuthLink>
            </AuthLinkRow>
          </>
        ) : null}

        {loadError ? <Alert kind="error">{loadError}</Alert> : null}

        {session ? (
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            {error ? <Alert kind="error">{error}</Alert> : null}

            <Field
              id="nama-usaha"
              label="Nama usaha"
              value={name}
              onChange={setName}
              autoComplete="organization"
              hint="Contoh: Kedai Kopi Senja."
              required
            />
            <Field
              id="jenis-usaha"
              label="Jenis usaha (opsional)"
              value={businessType}
              onChange={setBusinessType}
              hint="Contoh: kedai kopi, warung makan, toko retail."
            />
            <SelectField
              id="zona-waktu"
              label="Zona waktu"
              value={timezone}
              onChange={setTimezone}
              options={timezoneOptions}
              hint="Dipakai untuk tanggal transaksi dan laporan."
            />

            <Button type="submit" full disabled={busy}>
              {busy ? 'Membuat usaha...' : 'Buat usaha'}
            </Button>

            {session.workspaces.length > 0 ? (
              <AuthLink href="/dashboard">Kembali ke dashboard</AuthLink>
            ) : null}
          </form>
        ) : null}
      </AuthCard>
    </AuthShell>
  )
}
