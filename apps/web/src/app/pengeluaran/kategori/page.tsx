'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPatch, apiPost, errorMessage, type ExpenseCategoriesResponse } from '../../../lib/api'
import { ExpensesShell } from '../pengeluaran-shell'
import styles from '../pengeluaran.module.css'

export default function ExpenseCategoriesPage() {
  const app = useApp()
  const allowed = app.role === 'owner' || app.role === 'admin'
  const [categories, setCategories] = useState<ExpenseCategoriesResponse['categories'] | null>(null)
  const [name, setName] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<ExpenseCategoriesResponse>(`/api/workspaces/${app.workspaceId}/expense-categories${includeArchived ? '?archived=true' : ''}`)
    setLoading(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Kategori pengeluaran tidak bisa dimuat.'))
      return
    }
    setError(null)
    setCategories(result.data.categories)
  }, [app.workspaceId, includeArchived])

  useEffect(() => { void load() }, [load])

  if (!allowed) {
    return <ExpensesShell activeHref="/pengeluaran" title="Kategori pengeluaran"><ErrorState title="Anda tidak punya izin mengatur kategori" body="Pengaturan kategori hanya tersedia bagi Owner dan Admin." /></ExpensesShell>
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await apiPost<{ warnings: string[] }>(`/api/workspaces/${app.workspaceId}/expense-categories`, { name })
    setBusy(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Kategori tidak bisa disimpan.'))
      return
    }
    setName('')
    setMessage(result.data.warnings[0] ?? 'Kategori ditambahkan.')
    await load()
  }

  async function archive(id: number, archived: boolean) {
    const result = await apiPatch<{ warnings: string[] }>(`/api/workspaces/${app.workspaceId}/expense-categories/${id}`, { isArchived: archived })
    if (!result.ok) {
      setError(errorMessage(result.error, 'Kategori tidak bisa diubah.'))
      return
    }
    setMessage(result.data.warnings[0] ?? (archived ? 'Kategori diarsipkan.' : 'Kategori dipulihkan.'))
    await load()
  }

  return (
    <ExpensesShell activeHref="/pengeluaran" title="Kategori pengeluaran">
      {error ? <ErrorState title="Kategori gagal diproses" body={error} action={<button className={styles.secondaryButton} type="button" onClick={() => void load()}>Coba lagi</button>} /> : null}
      {message ? <Alert kind="info">{message}</Alert> : null}
      <form className={styles.actions} onSubmit={(event) => void create(event)}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="category-name">Nama kategori</label>
          <input className={styles.input} id="category-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required />
        </div>
        <button className={styles.button} type="submit" disabled={busy}>{busy ? 'Menyimpan' : 'Tambah kategori'}</button>
      </form>
      <label className={styles.meta}><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Tampilkan kategori yang diarsipkan</label>
      {loading ? <p role="status">Memuat kategori pengeluaran.</p> : null}
      {!loading && categories?.length === 0 ? <div className={styles.state}><p className={styles.stateTitle}>Belum ada kategori</p><p className={styles.stateBody}>Tambahkan kategori agar pengeluaran dapat dikelompokkan. Anda juga dapat mencatat pengeluaran tanpa kategori.</p></div> : null}
      {!loading && categories && categories.length > 0 ? <ul className={styles.list}>{categories.map((category) => <li className={styles.category} key={category.id}>
        <div className={styles.categoryRow}><div><p className={styles.title}>{category.name}{category.archived ? ' · Diarsipkan' : ''}</p><p className={styles.meta}>{category.expenseCount} catatan · {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(category.totalAmount)}</p></div>
          <button className={styles.secondaryButton} type="button" onClick={() => void archive(category.id, !category.archived)}>{category.archived ? 'Pulihkan' : 'Arsipkan'}</button>
        </div>
        {category.looksLikeStockPurchase ? <p className={styles.hint}>Nama ini mirip kategori pembelian barang dagangan. PO tetap dicatat sebagai pembelian, bukan pengeluaran.</p> : null}
      </li>)}</ul> : null}
    </ExpensesShell>
  )
}
