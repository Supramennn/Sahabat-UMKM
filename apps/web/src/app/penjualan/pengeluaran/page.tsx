'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type Expense,
  type ExpenseCategory,
} from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import { rupiah } from '../bagian'
import styles from '../penjualan.module.css'

interface ExpenseForm {
  categoryId: string
  description: string
  amount: string
  spentOn: string
  reference: string
}

const KOSONG: ExpenseForm = {
  categoryId: '',
  description: '',
  amount: '',
  spentOn: '',
  reference: '',
}

export default function ExpensesPage() {
  const app = useApp()

  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<ExpenseForm>(KOSONG)
  const [categoryIdFilter, setCategoryIdFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    const params = new URLSearchParams({ limit: '100' })
    if (categoryIdFilter) params.set('categoryId', categoryIdFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    const [expResult, catResult] = await Promise.all([
      apiGet<{ expenses: Expense[] }>(`/api/workspaces/${app.workspaceId}/expenses?${params}`),
      apiGet<{ categories: ExpenseCategory[] }>(`/api/workspaces/${app.workspaceId}/expense-categories`),
    ])

    if (expResult.ok) {
      setExpenses(expResult.data.expenses)
      setError(null)
    } else {
      setError(errorMessage(expResult.error, 'Daftar pengeluaran tidak bisa dimuat.'))
    }

    if (catResult.ok) setCategories(catResult.data.categories)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [app.workspaceId, categoryIdFilter, dateFrom, dateTo])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPost<{ expenseId: number }>(
      `/api/workspaces/${app.workspaceId}/expenses`,
      {
        categoryId: Number(form.categoryId),
        description: form.description,
        amount: form.amount,
        spentOn: form.spentOn === '' ? null : form.spentOn,
        reference: form.reference || null,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Pengeluaran tidak bisa disimpan.'))
      return
    }

    setForm(KOSONG)
    setSuccess('Pengeluaran sudah disimpan.')
    await load()
  }

  const totalPengeluaran = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0)

  return (
    <SalesShell activeHref="/penjualan/pengeluaran" title="Pengeluaran">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="kategori-filter">Kategori</label>
          <select
            className={styles.select}
            id="kategori-filter"
            value={categoryIdFilter}
            onChange={(e) => setCategoryIdFilter(e.target.value)}
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="dari">Dari tanggal</label>
          <input className={styles.input} id="dari" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="sampai">Sampai tanggal</label>
          <input className={styles.input} id="sampai" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className={styles.actions}>
        <span className={`${styles.badge} ${totalPengeluaran > 0 ? styles.badgePending : styles.badgeOk}`}>
          Total pengeluaran {rupiah(totalPengeluaran)}
        </span>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>Catat pengeluaran</h2>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="kategori">Kategori</label>
          <select className={styles.select} id="kategori" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
            <option value="">Pilih kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="deskripsi">Deskripsi</label>
          <input
            className={styles.input}
            id="deskripsi"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            placeholder="Contoh: Bayar listrik bulan Oktober"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="jumlah">Jumlah</label>
          <input
            className={styles.input}
            id="jumlah"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
            placeholder="Contoh: 500000"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="tanggal">Tanggal</label>
          <input className={styles.input} id="tanggal" type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="referensi">Referensi (opsional)</label>
          <input
            className={styles.input}
            id="referensi"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="Nomor faktur atau bukti bayar"
          />
        </div>

        <button type="submit" className={styles.submit} disabled={busy || form.categoryId === '' || form.description.trim() === '' || form.amount.trim() === ''}>
          {busy ? 'Menyimpan' : 'Catat pengeluaran'}
        </button>
      </form>

      {loading ? (
        <p role="status">Memuat daftar pengeluaran.</p>
      ) : expenses && expenses.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada pengeluaran</p>
          <p className={styles.stateBody}>
            Catat pengeluaran operasional di sini. Kategori dikelola di halaman terpisah.
          </p>
        </div>
      ) : null}

      {!loading && expenses && expenses.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Daftar pengeluaran</h2>
          <ul className={styles.list}>
            {expenses.map((expense) => (
              <li key={expense.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{expense.description}</span>
                  <span className={styles.cardMeta}>{rupiah(expense.amount)}</span>
                </span>
                <span className={styles.cardMeta}>
                  {expense.categoryName} · {expense.spentOn}
                  {expense.reference ? ` · Ref: ${expense.reference}` : ''}
                </span>
                <span className={styles.cardMeta}>Dicatat oleh {expense.createdByName}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SalesShell>
  )
}