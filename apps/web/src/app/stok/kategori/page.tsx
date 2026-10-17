'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type Category, type CategoriesResponse } from '../../../lib/api'
import { formatQty } from '../bagian'

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
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar kategori.
        </p>
      ) : categories && categories.length === 0 ? (
        <ErrorState
          title="Belum ada kategori"
          body="Kategori memudahkan mencari barang dan mengelompokkan laporan. Produk juga bisa dibiarkan tanpa kategori."
        />
      ) : null}

      {!loading && categories && categories.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {categories.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
            >
              <span className="text-[1.0625rem] font-semibold text-primary">{item.name}</span>
              <span className="text-sm text-text-secondary">
                {formatQty(item.productCount)} produk memakai kategori ini
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold">Tambah kategori</h2>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="nama-kategori">
            Nama kategori
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="nama-kategori"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Contoh: Minuman"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-transparent bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy || name.trim() === ''}
        >
          {busy ? 'Menyimpan' : 'Simpan kategori'}
        </button>
      </form>
    </AppShell>
  )
}
