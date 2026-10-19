'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  canAssignRole,
  grantFor,
  roleLabels,
  roles,
  type Role,
} from '@sahabat/shared'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, Button, ErrorState, Field, SelectField } from '../../components/ui'
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  errorMessage,
  type MessageResponse,
} from '../../../lib/api'

/**
 * PRD 6.1 dan PRD 8: daftar anggota dengan perannya, undangan lewat email, ubah
 * peran, dan keluarkan anggota. Server tetap memeriksa setiap aksi; halaman ini
 * hanya menyembunyikan yang memang tidak boleh dipakai.
 */

type Member = {
  id: number
  user_id: number
  name: string
  email: string
  role: Role
  joined_at: string
  removed_at: string | null
}

type MembersResponse = { members: Member[] }

const tanggal = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(iso))

export default function MembersPage() {
  return (
    <AppProvider title="Anggota dan peran">
      <MembersPageContent />
    </AppProvider>
  )
}

function MembersPageContent() {
  const app = useApp()
  const manage = grantFor(app.role, 'members.manage') !== 'none'

  const [members, setMembers] = useState<Member[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [undangBusy, setUndangBusy] = useState(false)

  const assignable = roles.filter(
    (candidate) => candidate !== 'owner' && canAssignRole(app.role, candidate),
  )

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<MembersResponse>(
      `/api/workspaces/${app.workspaceId}/members`,
    )
    setLoading(false)

    if (!result.ok) {
      setLoadError(errorMessage(result.error, 'Daftar anggota tidak bisa dimuat.'))
      return
    }
    setLoadError(null)
    setMembers(result.data.members)
  }, [app.workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  function bisaKelola(member: Member): boolean {
    if (!manage || member.role === 'owner') return false
    return app.role === 'owner' || member.role !== 'admin'
  }

  async function undang(event: FormEvent) {
    event.preventDefault()
    setUndangBusy(true)
    setMessage(null)
    setError(null)

    const result = await apiPost<MessageResponse>(
      `/api/workspaces/${app.workspaceId}/invitations`,
      { email: email.trim(), role },
    )

    setUndangBusy(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Undangan tidak bisa dikirim.'))
      return
    }
    setMessage(result.data.message)
    setEmail('')
  }

  async function ubahPeran(member: Member, peranBaru: Role) {
    setBusyId(member.id)
    setMessage(null)
    setError(null)

    const result = await apiPatch<MessageResponse>(
      `/api/workspaces/${app.workspaceId}/members/${member.id}`,
      { role: peranBaru },
    )

    setBusyId(null)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Peran tidak bisa diubah.'))
      return
    }
    setMessage(result.data.message)
    await load()
  }

  async function keluarkan(member: Member) {
    setBusyId(member.id)
    setMessage(null)
    setError(null)

    const result = await apiDelete(
      `/api/workspaces/${app.workspaceId}/members/${member.id}`,
    )

    setBusyId(null)
    setConfirmId(null)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Anggota tidak bisa dikeluarkan.'))
      return
    }
    setMessage(`${member.name} sudah dikeluarkan dari usaha ini.`)
    await load()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/anggota"
      breadcrumb="Pengaturan"
      title="Anggota dan peran"
    >
      {message ? <Alert kind="success">{message}</Alert> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {!manage ? (
        <Alert kind="info">
          Hanya Owner dan Admin yang bisa mengubah daftar anggota. Anda tetap bisa melihat
          siapa saja yang punya akses ke usaha ini.
        </Alert>
      ) : null}

      {loading ? <p role="status">Memuat daftar anggota.</p> : null}

      {loadError ? (
        <ErrorState
          title="Daftar anggota tidak bisa dimuat"
          body={loadError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Coba lagi
            </Button>
          }
        />
      ) : null}

      {manage && assignable.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold tracking-tight">Undang anggota</h2>
          <p className="text-[0.9375rem] text-text-secondary">
            Undangan dikirim lewat email. Tautannya hanya bisa dipakai sekali.
          </p>
          <form className="flex flex-col gap-3" onSubmit={undang}>
            <Field
              id="email-anggota"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              hint="Gunakan email yang aktif, karena tautan undangan dikirim ke sana."
              required
            />
            <SelectField
              id="peran-anggota"
              label="Peran"
              value={role}
              onChange={(value) => setRole(value as Role)}
              options={assignable.map((candidate) => ({
                value: candidate,
                label: roleLabels[candidate],
              }))}
              hint="Peran menentukan apa yang boleh dilakukan anggota di usaha ini."
            />
            <Button type="submit" full disabled={undangBusy}>
              {undangBusy ? 'Mengirim undangan...' : 'Kirim undangan'}
            </Button>
          </form>
        </section>
      ) : null}

      {members ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Anggota usaha</h2>
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li
                className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised sm:flex-row sm:items-center sm:justify-between"
                key={member.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{member.name}</p>
                  <p className="truncate text-[0.9375rem] text-text-secondary">{member.email}</p>
                  <p className="text-sm text-text-secondary">
                    Bergabung {tanggal(member.joined_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bisaKelola(member) ? (
                    <>
                      <label className="flex items-center gap-2">
                        <span className="visually-hidden">Peran {member.name}</span>
                        <select
                          className="min-h-touch cursor-pointer rounded-control border border-border-strong bg-surface px-2 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
                          value={member.role}
                          disabled={busyId === member.id}
                          onChange={(event) => void ubahPeran(member, event.target.value as Role)}
                        >
                          {assignable.map((candidate) => (
                            <option key={candidate} value={candidate}>
                              {roleLabels[candidate]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {confirmId === member.id ? (
                        <>
                          <Button
                            variant="danger"
                            disabled={busyId === member.id}
                            onClick={() => void keluarkan(member)}
                          >
                            Ya, keluarkan
                          </Button>
                          <Button variant="secondary" onClick={() => setConfirmId(null)}>
                            Batal
                          </Button>
                        </>
                      ) : (
                        <Button variant="danger" onClick={() => setConfirmId(member.id)}>
                          Keluarkan
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-[0.9375rem] text-text-secondary">
                      {roleLabels[member.role]}
                    </p>
                  )}
                </div>

                {confirmId === member.id ? (
                  <p className="text-[0.9375rem] text-text-secondary sm:basis-full">
                    {member.name} tidak akan bisa membuka data usaha ini lagi. Undangan
                    baru bisa dikirim ulang kapan saja.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  )
}
