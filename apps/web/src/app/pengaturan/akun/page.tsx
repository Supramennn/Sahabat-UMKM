'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Alert,
  AuthLink,
  Button,
  ErrorState,
  Field,
} from '../../components/ui'
import {
  apiGet,
  apiPatch,
  apiPost,
  errorMessage,
  type DevicesResponse,
  type MfaSetupResponse,
  type RecoveryCodesResponse,
  type SessionResponse,
} from '../../../lib/api'
import styles from './page.module.css'

/**
 * PRD 6.1: pengaturan akun. Halaman ini memuat sesi dari server, jadi punya
 * ketiga keadaan yang diminta PRD 10: memuat, kosong, dan galat.
 */
export default function AccountSettingsPage() {
  return (
    <div className={styles.settingsShell}>
      <h1 className={styles.settingsTitle}>Pengaturan akun</h1>
      <SettingsSections />
    </div>
  )
}

function SettingsSections() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const result = await apiGet<SessionResponse>('/api/auth/session')

    if (!result.ok) {
      setLoadError(result.error.error === 'belum_masuk' ? 'Anda belum masuk.' : errorMessage(result.error))
      setLoading(false)
      return
    }

    setSession(result.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className={styles.settingsMain}>
        <p role="status">Memuat pengaturan akun.</p>
      </div>
    )
  }


  if (loadError) {
    return (
      <div className={styles.settingsMain}>
        <ErrorState
          title="Pengaturan akun tidak bisa dimuat"
          body={loadError}
          action={<AuthLink href="/masuk">Buka halaman masuk</AuthLink>}
        />
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className={styles.settingsMain}>
      <p className={styles.settingsMeta}>{session.user.email}</p>

      <div className={styles.sectionList}>
        <ProfileSection name={session.user.name} />
        <PasswordSection />
        <EmailSection currentEmail={session.user.email} />
        <DevicesSection />
        <MfaSection mandatory={false} />
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description ? <p className={styles.recoveryNote}>{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function useSubmit() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    const message = await action()
    if (message) {
      setSuccess(message)
    }
    setBusy(false)
  }

  return { error, success, busy, run, setError }
}

function ProfileSection({ name }: { name: string }) {
  const { error, success, busy, run } = useSubmit()
  const [currentName, setCurrentName] = useState(name)

  return (
    <Section title="Nama" description="Nama ini tampil di workspace dan laporan.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}
      <form
        className={styles.form}
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void run(async () => {
            const result = await apiPatch<{ message: string }>('/api/auth/profile', { name: currentName })
            return result.ok ? result.data.message : errorMessage(result.error)
          })
        }}
      >
        <Field id="profile-name" label="Nama" value={currentName} onChange={setCurrentName} required disabled={busy} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Menyimpan' : 'Simpan nama'}
        </Button>
      </form>
    </Section>
  )
}

function PasswordSection() {
  const { error, success, busy, run } = useSubmit()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const tooShort = newPassword.length > 0 && newPassword.length < 12

  return (
    <Section title="Kata sandi" description="Kata sandi baru minimal 12 karakter dan tidak boleh sama dengan yang pernah dipakai.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}
      <form
        className={styles.form}
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void run(async () => {
            const result = await apiPost<{ message: string }>('/api/auth/change-password', {
              currentPassword,
              newPassword,
            })
            if (!result.ok) return errorMessage(result.error)
            setCurrentPassword('')
            setNewPassword('')
            return result.data.message
          })
        }}
      >
        <Field
          id="current-password"
          label="Kata sandi sekarang"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          required
          disabled={busy}
        />
        <Field
          id="new-password"
          label="Kata sandi baru"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          required
          disabled={busy}
          error={tooShort ? 'Kata sandi baru masih kurang dari 12 karakter.' : undefined}
        />
        <Button type="submit" disabled={busy || tooShort}>
          {busy ? 'Menyimpan' : 'Ganti kata sandi'}
        </Button>
      </form>
    </Section>
  )
}

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const { error, success, busy, run } = useSubmit()
  const [newEmail, setNewEmail] = useState('')

  return (
    <Section title="Email" description={`Email sekarang: ${currentEmail}`}>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}
      <form
        className={styles.form}
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void run(async () => {
            const result = await apiPost<{ message: string }>('/api/auth/change-email', { newEmail })
            return result.ok ? result.data.message : errorMessage(result.error)
          })
        }}
      >
        <Field
          id="new-email"
          label="Email baru"
          type="email"
          inputMode="email"
          value={newEmail}
          onChange={setNewEmail}
          autoComplete="email"
          required
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Menyimpan' : 'Ganti email'}
        </Button>
      </form>
    </Section>
  )
}

function DevicesSection() {
  const [devices, setDevices] = useState<DevicesResponse['devices'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<DevicesResponse>('/api/auth/devices')
    if (!result.ok) {
      setError(errorMessage(result.error))
    } else {
      setDevices(result.data.devices)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Section
      title="Perangkat dan sesi"
      description="Sesi yang masih aktif. Keluarkan semuanya jika perangkat Anda hilang."
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar perangkat.</p>
      ) : devices && devices.length > 0 ? (
        <ul className={styles.deviceList}>
          {devices.map((device) => (
            <li key={device.id} className={styles.device}>
              {device.current_session ? (
                <span className={styles.deviceBadge}>Perangkat ini</span>
              ) : null}
              <span>{device.label}</span>
              <span className={styles.deviceMeta}>
                Aktif sejak {new Date(device.last_seen_at).toLocaleString('id-ID')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada perangkat lain</p>
          <p className={styles.stateBody}>
            Hanya perangkat yang sedang Anda gunakan yang tercatat. Daftar ini bertambah setiap kali
            Anda masuk dari perangkat lain.
          </p>
        </div>
      )}

      <div className={styles.actions}>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            setMessage(null)
            void apiPost<{ revoked: number }>('/api/auth/devices/revoke-others').then((result) => {
              if (result.ok) {
                setMessage(
                  result.data.revoked === 0
                    ? 'Tidak ada sesi lain yang aktif.'
                    : `${result.data.revoked} sesi lain sudah dikeluarkan.`,
                )
                void load()
              } else {
                setError(errorMessage(result.error))
              }
              setBusy(false)
            })
          }}
        >
          {busy ? 'Memproses' : 'Keluarkan semua sesi lain'}
        </Button>
      </div>
    </Section>
  )
}

function MfaSection({ mandatory }: { mandatory: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null)
  const [token, setToken] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [proof, setProof] = useState(false)
  const [proofToken, setProofToken] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<{ enabled: boolean; mandatory: boolean; satisfied: boolean }>(
      '/api/auth/mfa/status',
    )
    if (result.ok) {
      setEnabled(result.data.enabled)
    } else {
      setError(errorMessage(result.error))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tokenInvalid = proofToken.length > 0 && !/^\d{6}$/.test(proofToken)

  if (loading) {
    return (
      <Section title="Verifikasi dua langkah">
        <p role="status">Memuat status.</p>
      </Section>
    )
  }

  if (recoveryCodes) {
    return (
      <Section
        title="Simpan kode pemulihan"
        description="Kode ini hanya ditampilkan sekali. Cetak atau simpan di tempat aman, karena setiap kode hanya berlaku satu kali."
      >
        <ul className={styles.recoveryGrid}>
          {recoveryCodes.map((code) => (
            <li key={code} className={styles.recoveryCode}>
              {code}
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button
            onClick={() => {
              setRecoveryCodes(null)
              setProof(false)
              setProofToken('')
            }}
          >
            Saya sudah menyimpannya
          </Button>
        </div>
      </Section>
    )
  }

  if (setup) {
    return (
      <Section
        title="Verifikasi dua langkah"
        description="Buka aplikasi autentikator Anda, lalu masukkan kode 6 angka yang muncul."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        <p className={styles.sectionTitle}>Kode rahasia</p>
        <code className={styles.secret}>{setup.secret}</code>
        <form
          className={styles.form}
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            setBusy(true)
            setError(null)
            void apiPost<RecoveryCodesResponse>('/api/auth/mfa/confirm', { token }).then((result) => {
              if (result.ok) {
                setSetup(null)
                setToken('')
                setRecoveryCodes(result.data.recoveryCodes)
              } else {
                setError(errorMessage(result.error, 'Kode itu tidak cocok.'))
              }
              setBusy(false)
            })
          }}
        >
          <Field
            id="mfa-token"
            label="Kode 6 angka"
            value={token}
            onChange={setToken}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={busy}
            error={tokenInvalid ? 'Kode berisi 6 angka.' : undefined}
          />
          <Button type="submit" disabled={busy || tokenInvalid}>
            {busy ? 'Memeriksa' : 'Aktifkan'}
          </Button>
        </form>
      </Section>
    )
  }

  if (proof) {
    return (
      <Section
        title="Kode pemulihan baru"
        description="Masukkan kode dari aplikasi autentikator, atau salah satu kode pemulihan yang masih berlaku. Kode lama tidak berlaku setelah kode baru dibuat."
      >
        {error ? <Alert kind="error">{error}</Alert> : null}
        <form
          className={styles.form}
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            setBusy(true)
            setError(null)
            void apiPost<RecoveryCodesResponse>('/api/auth/mfa/recovery-codes', {
              token: proofToken,
            }).then((result) => {
              if (result.ok) {
                setProof(false)
                setProofToken('')
                setRecoveryCodes(result.data.recoveryCodes)
              } else {
                setError(errorMessage(result.error, 'Kode itu tidak cocok.'))
              }
              setBusy(false)
            })
          }}
        >
          <Field
            id="recovery-proof"
            label="Kode 6 angka"
            value={proofToken}
            onChange={setProofToken}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={busy}
            error={tokenInvalid ? 'Kode berisi 6 angka.' : undefined}
          />
          <Button type="submit" disabled={busy || tokenInvalid}>
            {busy ? 'Memproses' : 'Buat kode baru'}
          </Button>
        </form>
        <div className={styles.actions}>
          <button type="button" className={styles.textButton} onClick={() => setProof(false)}>
            Batal
          </button>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="Verifikasi dua langkah"
      description={
        mandatory
          ? 'Wajib untuk Owner dan Admin 30 hari setelah akun dibuat.'
          : 'Menambahkan kode dari aplikasi autentikator setiap kali Anda masuk.'
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className={styles.state}>
        <p className={styles.stateTitle}>{enabled ? 'Aktif' : 'Belum aktif'}</p>
        <p className={styles.stateBody}>
          {enabled
            ? 'Kode dari aplikasi autentikator diminta setiap kali Anda masuk.'
            : 'Belum ada aplikasi autentikator yang terhubung ke akun ini.'}
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError(null)
            if (enabled) {
              setProof(true)
              setBusy(false)
              return
            }
            void apiPost<MfaSetupResponse>('/api/auth/mfa/setup').then((result) => {
              if (result.ok) {
                setSetup(result.data)
              } else {
                setError(errorMessage(result.error))
              }
              setBusy(false)
            })
          }}
        >
          {busy ? 'Memproses' : enabled ? 'Buat kode pemulihan baru' : 'Aktifkan verifikasi dua langkah'}
        </Button>
      </div>
    </Section>
  )
}
