'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { can, roleLabels, type Role } from '@sahabat/shared'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import {
  Alert,
  AuthLink,
  Button,
  ErrorState,
  Field,
  SelectField,
} from '../../components/ui'
import {
  apiGet,
  apiPatch,
  apiPost,
  errorMessage,
  type MessageResponse,
  type WorkspaceResponse,
} from '../../../lib/api'
import { timezoneOptionsWith } from '../../../lib/workspace-options'

/**
 * PRD 6.1: profil usaha berisi nama, jenis usaha, zona waktu, dan mata uang.
 * Mata uang selalu Rupiah, jadi ditampilkan sebagai keterangan, bukan isian.
 */
export default function WorkspaceProfilePage() {
  return (
    <AppProvider title="Profil usaha">
      <WorkspaceProfileContent />
    </AppProvider>
  )
}

function WorkspaceProfileContent() {
  const app = useApp()
  const bolehUbah = can(app.role, 'products.manage')

  const [profile, setProfile] = useState<WorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [timezone, setTimezone] = useState('Asia/Jakarta')
  const [saving, setSaving] = useState(false)
  const [switching, setSwitching] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<WorkspaceResponse>(
      `/api/workspaces/${app.workspaceId}`,
    )
    setLoading(false)

    if (!result.ok) {
      setLoadError(errorMessage(result.error, 'Profil usaha tidak bisa dimuat.'))
      return
    }
    setLoadError(null)
    setProfile(result.data)
  }, [app.workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!profile) return
    setName(profile.workspace.name)
    setBusinessType(profile.workspace.businessType ?? '')
    setTimezone(profile.workspace.timezone)
  }, [profile])

  async function simpan(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const namaBaru = name.trim()
    const jenisBaru = businessType.trim()
    const result = await apiPatch<MessageResponse>(
      `/api/workspaces/${app.workspaceId}`,
      {
        name: namaBaru,
        businessType: jenisBaru === '' ? null : jenisBaru,
        timezone,
      },
    )

    setSaving(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Profil usaha tidak bisa disimpan.'))
      return
    }

    setMessage(result.data.message)
    app.renameWorkspace(namaBaru)
    setProfile((previous) =>
      previous
        ? {
            ...previous,
            workspace: {
              ...previous.workspace,
              name: namaBaru,
              businessType: jenisBaru === '' ? null : jenisBaru,
              timezone,
            },
          }
        : previous,
    )
  }

  async function bukaUsaha(workspaceId: number) {
    setSwitching(workspaceId)
    setError(null)
    setMessage(null)

    const result = await apiPost('/api/auth/switch-workspace', { workspaceId })
    if (!result.ok) {
      setSwitching(null)
      setError(errorMessage(result.error, 'Usaha tidak bisa diganti.'))
      return
    }
    window.location.reload()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/usaha"
      breadcrumb="Pengaturan"
      title="Profil usaha"
    >
      {message ? <Alert kind="success">{message}</Alert> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {!bolehUbah ? (
        <Alert kind="info">
          Hanya Owner dan Admin yang bisa mengubah profil usaha. Anda tetap bisa melihat
          data usaha ini.
        </Alert>
      ) : null}

      {loading ? <p role="status">Memuat profil usaha.</p> : null}

      {loadError ? (
        <ErrorState
          title="Profil usaha tidak bisa dimuat"
          body={loadError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Coba lagi
            </Button>
          }
        />
      ) : null}

      {profile ? (
        <section className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold tracking-tight">Data usaha</h2>
          <form className="flex flex-col gap-4" onSubmit={simpan}>
            <Field
              id="nama-usaha"
              label="Nama usaha"
              value={name}
              onChange={setName}
              autoComplete="organization"
              disabled={!bolehUbah}
              required
            />
            <Field
              id="jenis-usaha"
              label="Jenis usaha (opsional)"
              value={businessType}
              onChange={setBusinessType}
              hint="Contoh: kedai kopi, warung makan, toko retail."
              disabled={!bolehUbah}
            />
            <SelectField
              id="zona-waktu"
              label="Zona waktu"
              value={timezone}
              onChange={setTimezone}
              options={timezoneOptionsWith(profile.workspace.timezone)}
              hint="Dipakai untuk tanggal transaksi dan laporan."
              disabled={!bolehUbah}
            />
            <div className="flex flex-col gap-1">
              <p className="text-[0.9375rem] font-medium text-text-primary">Mata uang</p>
              <p className="text-base text-text-primary">Rupiah (IDR)</p>
              <p className="text-sm text-text-secondary">
                Semua nominal di Sahabat UMKM memakai Rupiah.
              </p>
            </div>

            {bolehUbah ? (
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan profil'}
              </Button>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Usaha Anda</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Satu akun bisa menjadi anggota beberapa usaha. Usaha yang sedang dibuka
            menentukan data yang tampil di seluruh halaman.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {app.workspaces.map((workspace) => {
            const aktif = workspace.id === app.workspaceId
            const peran = roleLabels[workspace.role as Role] ?? workspace.role
            return (
              <li
                className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised sm:flex-row sm:items-center sm:justify-between"
                key={workspace.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{workspace.name}</p>
                  <p className="text-sm text-text-secondary">{peran}</p>
                </div>
                {aktif ? (
                  <p className="text-sm font-medium text-secondary">Sedang dibuka</p>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={switching === workspace.id}
                    onClick={() => void bukaUsaha(workspace.id)}
                  >
                    {switching === workspace.id ? 'Membuka...' : 'Buka usaha'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        <div>
          <AuthLink href="/buat-usaha">Tambah usaha baru</AuthLink>
        </div>
      </section>
    </AppShell>
  )
}
