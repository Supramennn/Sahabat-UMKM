'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import { apiGet, apiPost, apiPatch, errorMessage, type PaymentMethod } from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import styles from '../penjualan.module.css'

interface MethodForm {
  name: string
  isActive: boolean
}

const KOSONG: MethodForm = {
  name: '',
  isActive: true,
}

export default function PaymentMethodsPage() {
  const app = useApp()

  const [methods, setMethods] = useState<PaymentMethod[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<MethodForm>(KOSONG)
  const [editId, setEditId] = useState<number | null>(null)

  async function load() {
    const result = await apiGet<{ methods: PaymentMethod[] }>(`/api/workspaces/${app.workspaceId}/payment-methods`)
    if (result.ok) {
      setMethods(result.data.methods)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar metode pembayaran tidak bisa dimuat.'))
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [app.workspaceId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    let result
    if (editId) {
      result = await apiPatch<{ message: string }>(
        `/api/workspaces/${app.workspaceId}/payment-methods/${editId}`,
        { name: form.name, isActive: form.isActive },
      )
    } else {
      result = await apiPost<{ methodId: number }>(
        `/api/workspaces/${app.workspaceId}/payment-methods`,
        { name: form.name },
      )
    }

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, editId ? 'Metode tidak bisa diperbarui.' : 'Metode tidak bisa disimpan.'))
      return
    }

    setForm(KOSONG)
    setEditId(null)
    setSuccess(editId ? 'Metode pembayaran sudah diperbarui.' : 'Metode pembayaran sudah disimpan.')
    await load()
  }

  async function mulaiEdit(method: PaymentMethod) {
    setForm({ name: method.name, isActive: method.isActive })
    setEditId(method.id)
  }

  async function batalkanEdit() {
    setForm(KOSONG)
    setEditId(null)
  }

  async function toggleAktif(method: PaymentMethod) {
    if (!window.confirm(`${method.isActive ? 'Nonaktifkan' : 'Aktifkan'} metode "${method.name}"?`)) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPatch<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/payment-methods/${method.id}`,
      { isActive: !method.isActive },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Status tidak bisa diubah.'))
      return
    }

    setSuccess(`Metode ${method.name} ${method.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
    await load()
  }

  return (
    <SalesShell activeHref="/penjualan/metode-bayar" title="Metode pembayaran">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar metode pembayaran.</p>
      ) : methods && methods.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada metode pembayaran</p>
          <p className={styles.stateBody}>
            Tambahkan metode pembayaran yang digunakan usaha Anda. Metode ini akan muncul sebagai
            pilihan saat mencatat penjualan.
          </p>
        </div>
      ) : null}

      {!loading && methods && methods.length > 0 ? (
        <>
          <ul className={styles.list}>
            {methods.map((method) => (
              <li key={method.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{method.name}</span>
                  {method.isActive ? (
                    <span className={`${styles.badge} ${styles.badgeOk}`}>Aktif</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Nonaktif</span>
                  )}
                </span>
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={busy}
                    onClick={() => void mulaiEdit(method)}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={busy}
                    onClick={() => void toggleAktif(method)}
                  >
                    {method.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>{editId ? 'Ubah metode' : 'Tambah metode pembayaran'}</h2>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama">Nama metode</label>
          <input
            className={styles.input}
            id="nama"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Contoh: QRIS, E-Wallet, Kredit"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="aktif">Status</label>
          <select className={styles.select} id="aktif" value={String(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={busy || form.name.trim() === ''}>
            {busy ? 'Menyimpan' : editId ? 'Simpan perubahan' : 'Simpan metode'}
          </button>
          {editId && (
            <button type="button" className={styles.linkButton} onClick={() => void batalkanEdit()}>
              Batal
            </button>
          )}
        </div>
      </form>
    </SalesShell>
  )
}