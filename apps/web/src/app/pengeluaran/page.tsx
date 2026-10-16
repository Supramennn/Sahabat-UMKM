'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet, errorMessage, type Expense, type ExpensesResponse } from '../../lib/api'
import { can } from '@sahabat/shared'
import { ErrorState } from '../components/ui'
import { useApp } from '../components/app-context'
import { ExpensesShell } from './pengeluaran-shell'
import styles from './pengeluaran.module.css'

const PAGE_SIZE = 50
const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount)

export default function ExpensesPage() {
  const app = useApp()
  const canManage = can(app.role, 'expenses.manage')
  const canManageCategories = app.role === 'owner' || app.role === 'admin'
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (categoryId) params.set('categoryId', categoryId)
    const result = await apiGet<ExpensesResponse>(`/api/workspaces/${app.workspaceId}/expenses?${params}`)
    setLoading(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Daftar pengeluaran tidak bisa dimuat.'))
      return
    }
    setError(null)
    setExpenses(result.data.expenses)
    setTotalAmount(result.data.summary.totalAmount)
    setTotal(result.data.pagination.total)
  }, [app.workspaceId, categoryId, from, offset, to])

  useEffect(() => {
    void apiGet<{ categories: Array<{ id: number; name: string }> }>(`/api/workspaces/${app.workspaceId}/expense-categories`)
      .then((result) => { if (result.ok) setCategories(result.data.categories) })
  }, [app.workspaceId])

  useEffect(() => { void load() }, [load])

  return (
    <ExpensesShell
      activeHref="/pengeluaran"
      title="Pengeluaran"
      actions={canManage ? <Link className={styles.button} href="/pengeluaran/baru">Catat pengeluaran</Link> : undefined}
    >
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-kategori">Kategori</label>
          <select className={styles.select} id="filter-kategori" value={categoryId} onChange={(event) => { setOffset(0); setCategoryId(event.target.value) }}>
            <option value="">Semua kategori</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-dari">Dari tanggal</label>
          <input className={styles.input} id="filter-dari" type="date" value={from} onChange={(event) => { setOffset(0); setFrom(event.target.value) }} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-sampai">Sampai tanggal</label>
          <input className={styles.input} id="filter-sampai" type="date" value={to} onChange={(event) => { setOffset(0); setTo(event.target.value) }} />
        </div>
        {canManageCategories ? <Link className={styles.secondaryButton} href="/pengeluaran/kategori">Atur kategori</Link> : null}
      </div>

      {error ? <ErrorState title="Daftar pengeluaran gagal dimuat" body={error} action={<button className={styles.secondaryButton} type="button" onClick={() => void load()}>Coba lagi</button>} /> : null}
      {loading ? <p role="status">Memuat pengeluaran.</p> : null}
      {!loading && !error && expenses?.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada pengeluaran pada pilihan ini</p>
          <p className={styles.stateBody}>Catat biaya operasional seperti sewa, listrik, atau transportasi. Pembelian barang dagangan melalui PO tetap dicatat di Pembelian.</p>
          {canManage ? <Link className={styles.button} href="/pengeluaran/baru">Catat pengeluaran</Link> : null}
        </div>
      ) : null}
      {!loading && !error && expenses && expenses.length > 0 ? <>
        <div className={styles.summary}>
          <p className={styles.summaryLabel}>Total pada pilihan ini, {total} catatan</p>
          <p className={styles.summaryValue}>{rupiah(totalAmount)}</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="visually-hidden">Pengeluaran berdasarkan tanggal, kategori, deskripsi, dan nominal</caption>
            <thead><tr><th scope="col">Tanggal</th><th scope="col">Kategori dan deskripsi</th><th scope="col">Referensi</th><th scope="col">Nominal</th></tr></thead>
            <tbody>{expenses.map((expense) => <tr key={expense.id}>
              <td>{expense.spentOn}</td>
              <td><Link href={`/pengeluaran/${expense.id}`}>{expense.categoryName}: {expense.description}</Link>{expense.purchaseOrderNumber ? <div className={styles.meta}>Terkait {expense.purchaseOrderNumber}</div> : null}</td>
              <td>{expense.reference ?? 'Tidak ada'}</td>
              <td className={styles.amount}>{rupiah(expense.amount)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className={styles.list}>{expenses.map((expense) => <li className={styles.card} key={expense.id}>
          <Link className={styles.cardLink} href={`/pengeluaran/${expense.id}`}>
            <span className={styles.cardTop}><span className={styles.title}>{expense.categoryName}</span><span className={styles.amount}>{rupiah(expense.amount)}</span></span>
            <span className={styles.description}>{expense.description}</span>
            <span className={styles.cardBottom}><span className={styles.meta}>{expense.spentOn}{expense.reference ? ` · ${expense.reference}` : ''}</span><span className={styles.meta}>{expense.attachmentCount} lampiran</span></span>
          </Link>
        </li>)}</ul>
        <nav className={styles.actions} aria-label="Halaman pengeluaran">
          <span className={styles.meta}>Menampilkan {offset + 1} sampai {Math.min(offset + PAGE_SIZE, total)} dari {total} pengeluaran</span>
          {offset > 0 ? <button className={styles.secondaryButton} type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Sebelumnya</button> : null}
          {offset + PAGE_SIZE < total ? <button className={styles.secondaryButton} type="button" onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya</button> : null}
        </nav>
      </> : null}
    </ExpensesShell>
  )
}
