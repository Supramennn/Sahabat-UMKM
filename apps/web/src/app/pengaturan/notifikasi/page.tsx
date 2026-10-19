'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, Button, CheckboxField, ErrorState } from '../../components/ui'
import {
  apiGet,
  apiPatch,
  errorMessage,
  type NotificationPreferencesResponse,
} from '../../../lib/api'

/**
 * Pengaturan notifikasi per pengguna (PRD 6.9: "Setiap pengguna bisa mengatur
 * jenis notifikasi sendiri").
 *
 * Pilihannya melekat pada akun, bukan workspace, karena satu akun bisa menjadi
 * anggota beberapa usaha dengan satu alamat email. Server tetap menentukan siapa
 * yang layak menerima tiap jenis pemberitahuan; halaman ini hanya mematikan atau
 * menyalakan kanalnya.
 */

export default function NotificationSettingsPage() {
  return (
    <AppProvider title="Pengaturan notifikasi">
      <NotificationSettingsContent />
    </AppProvider>
  )
}

function NotificationSettingsContent() {
  const app = useApp()
  const [data, setData] = useState<NotificationPreferencesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await apiGet<NotificationPreferencesResponse>('/api/notifications/preferences')

    if (!result.ok) {
      setLoadError(errorMessage(result.error, 'Pengaturan notifikasi tidak bisa dimuat.'))
      return
    }
    setLoadError(null)
    setData({ preferences: result.data.preferences, digestEnabled: result.data.digestEnabled })
  }, [])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  function ubahKanal(kind: string, kanal: 'inApp' | 'email', value: boolean) {
    setData((sebelumnya) => {
      if (!sebelumnya) return sebelumnya
      return {
        ...sebelumnya,
        preferences: sebelumnya.preferences.map((item) =>
          item.kind === kind ? { ...item, [kanal]: value } : item,
        ),
      }
    })
  }

  async function simpan(event: FormEvent) {
    event.preventDefault()
    if (!data) return

    setSaving(true)
    setMessage(null)
    setSaveError(null)

    const result = await apiPatch<NotificationPreferencesResponse>('/api/notifications/preferences', {
      preferences: data.preferences.map((item) => ({
        kind: item.kind,
        inApp: item.inApp,
        email: item.email,
      })),
      digestEnabled: data.digestEnabled,
    })

    setSaving(false)
    if (!result.ok) {
      setSaveError(errorMessage(result.error, 'Pengaturan tidak bisa disimpan.'))
      return
    }

    setData({ preferences: result.data.preferences, digestEnabled: result.data.digestEnabled })
    setMessage('Pengaturan notifikasi tersimpan.')
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/notifikasi"
      breadcrumb="Pengaturan"
      title="Pengaturan notifikasi"
    >
      {message ? <Alert kind="success">{message}</Alert> : null}
      {saveError ? <Alert kind="error">{saveError}</Alert> : null}

      {loadError ? (
        <ErrorState
          title="Pengaturan notifikasi tidak bisa dimuat"
          body={loadError}
          action={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Coba lagi
            </Button>
          }
        />
      ) : null}

      {loading ? <p role="status">Memuat pengaturan notifikasi.</p> : null}

      {data && !loading ? (
        <form className="flex flex-col gap-4" onSubmit={simpan}>
          <section className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-primary">Jenis pemberitahuan</h2>
              <p className="text-[0.9375rem] text-text-secondary">
                Pilih cara Anda menerima tiap jenis pemberitahuan. Pilihan ini berlaku untuk akun
                Anda di semua usaha. Pemberitahuan hanya dikirim untuk hal yang boleh Anda lihat.
              </p>
            </div>

            <ul className="flex list-none flex-col p-0">
              {data.preferences.map((item) => (
                <li
                  className="flex flex-col gap-2 border-t border-border-subtle py-3 first:border-t-0 first:pt-0 last:pb-0"
                  key={item.kind}
                >
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium text-text-primary">{item.label}</p>
                    <p className="text-sm text-text-secondary">{item.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-6">
                    <CheckboxField
                      id={`notifikasi-${item.kind}-email`}
                      label="Email"
                      ariaLabel={`${item.label}: email`}
                      checked={item.email}
                      onChange={(value) => ubahKanal(item.kind, 'email', value)}
                    />
                    <CheckboxField
                      id={`notifikasi-${item.kind}-aplikasi`}
                      label="Dalam aplikasi"
                      ariaLabel={`${item.label}: dalam aplikasi`}
                      checked={item.inApp}
                      onChange={(value) => ubahKanal(item.kind, 'inApp', value)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <h2 className="text-lg font-semibold text-primary">Ringkasan harian</h2>
            <CheckboxField
              id="ringkasan-harian"
              label="Kirim ringkasan harian lewat email"
              hint="Satu email berisi pemberitahuan sejak ringkasan terakhir, dikirim pagi hari menurut zona waktu usaha Anda."
              checked={data.digestEnabled}
              onChange={(value) =>
                setData((sebelumnya) => (sebelumnya ? { ...sebelumnya, digestEnabled: value } : sebelumnya))
              }
            />
          </section>

          <div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan pengaturan'}
            </Button>
          </div>
        </form>
      ) : null}
    </AppShell>
  )
}
