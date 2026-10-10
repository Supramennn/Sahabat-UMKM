'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type Category, type CategoriesResponse } from '../../../lib/api'
import { formatQty } from '../bagian'
import styles from '../stok.module.css'

/**
 * PRD 5: Stok > Kategori. Kategori tidak pernah dihapus, karena produk yang sudah
 * memakai kategori itu harus tetap punya riwayatnya (PRD 6.2).
 */

export default function CategoriesPage() {
  const app = useApp()

  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    const result = await apiGet<CategoriesResponse>(`/api/workspaces/${app.workspaceId}/categories`)
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

    const result = await apiPost(`/api/workspaces/${app.workspaceId}/categories`, { name })
    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Kategori tidak bisa ditambah.'))
      return
    }

    setName('')
    setSuccess('Kategori sudah ditambahkan.')
    await load()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/kategori"
      breadcrumb="Stok"
      title="Kategori"
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar kategori.</p>
      ) : categories && categories.length === 0 ? (
        <ErrorState
          title="Belum ada kategori"
          body="Kategori memudahkan mencari barang dan mengelompokkan laporan. Produk juga bisa dibiarkan tanpa kategori."
        />
      ) : null}

      {!loading && categories && categories.length > 0 ? (
        <ul className={styles.list}>
          {categories.map((item) => (
            <li key={item.id} className={styles.card}>
              <span className={styles.cardName}>{item.name}</span>
              <span className={styles.cardMeta}>
                {formatQty(item.productCount)} produk memakai kategori ini
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>Tambah kategori</h2>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama-kategori">
            Nama kategori
          </label>
          <input
            className={styles.input}
            id="nama-kategori"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Contoh: Minuman"
          />
        </div>
        <button type="submit" className={styles.submit} disabled={busy || name.trim() === ''}>
          {busy ? 'Menyimpan' : 'Simpan kategori'}
        </button>
      </form>
    </AppShell>
  )
}
