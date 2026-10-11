'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import { apiGet, apiPost, apiPatch, errorMessage, type ExpenseCategory } from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import styles from '../penjualan.module.css'

interface CategoryForm {
  name: string
  isActive: boolean
}

const KOSONG: CategoryForm = {
  name: '',
  isActive: true,
}

export default function ExpenseCategoriesPage() {
  const app = useApp()

  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<CategoryForm>(KOSONG)
  const [editId, setEditId] = useState<number | null>(null)

  async function load() {
    const result = await apiGet<{ categories: ExpenseCategory[] }>(`/api/workspaces/${app.workspaceId}/expense-categories`)
    if (result.ok) {
      setCategories(result.data.categories)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar kategori tidak bisa dimuat.'))
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
        `/api/workspaces/${app.workspaceId}/expense-categories/${editId}`,
        { name: form.name, isActive: form.isActive },
      )
    } else {
      result = await apiPost<{ categoryId: number }>(
        `/api/workspaces/${app.workspaceId}/expense-categories`,
        { name: form.name },
      )
    }

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, editId ? 'Kategori tidak bisa diperbarui.' : 'Kategori tidak bisa disimpan.'))
      return
    }

    setForm(KOSONG)
    setEditId(null)
    setSuccess(editId ? 'Kategori sudah diperbarui.' : 'Kategori sudah disimpan.')
    await load()
  }

  async function mulaiEdit(category: ExpenseCategory) {
    setForm({ name: category.name, isActive: category.isActive })
    setEditId(category.id)
  }

  async function batalkanEdit() {
    setForm(KOSONG)
    setEditId(null)
  }

  async function toggleAktif(category: ExpenseCategory) {
    if (!window.confirm(`${category.isActive ? 'Nonaktifkan' : 'Aktifkan'} kategori "${category.name}"?`)) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPatch<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/expense-categories/${category.id}`,
      { isActive: !category.isActive },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Status tidak bisa diubah.'))
      return
    }

    setSuccess(`Kategori ${category.name} ${category.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
    await load()
  }

  return (
    <SalesShell activeHref="/penjualan/kategori-pengeluaran" title="Kategori pengeluaran">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar kategori.</p>
      ) : categories && categories.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada kategori</p>
          <p className={styles.stateBody}>
            Tambahkan kategori pengeluaran untuk mengelompokkan biaya operasional. Kategori bawaan
            seperti Sewa, Listrik, Gaji sudah disediakan otomatis.
          </p>
        </div>
      ) : null}

      {!loading && categories && categories.length > 0 ? (
        <>
          <ul className={styles.list}>
            {categories.map((category) => (
              <li key={category.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{category.name}</span>
                  {category.isActive ? (
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
                    onClick={() => void mulaiEdit(category)}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={busy}
                    onClick={() => void toggleAktif(category)}
                  >
                    {category.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>{editId ? 'Ubah kategori' : 'Tambah kategori pengeluaran'}</h2>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama">Nama kategori</label>
          <input
            className={styles.input}
            id="nama"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Contoh: Pajak, Servis kendaraan"
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
            {busy ? 'Menyimpan' : editId ? 'Simpan perubahan' : 'Simpan kategori'}
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