'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet, errorMessage, type Expense, type ExpensesResponse } from '../../lib/api'
import { can } from '@sahabat/shared'
import { ErrorState } from '../components/ui'
import { useApp } from '../components/app-context'
import { ExpensesShell } from './pengeluaran-shell'

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
      actions={canManage ? <Link className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-transparent bg-secondary px-4 font-medium text-surface no-underline transition-colors hover:bg-secondary-deep" href="/pengeluaran/baru">Catat pengeluaran</Link> : undefined}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-kategori">Kategori</label>
          <select className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary" id="filter-kategori" value={categoryId} onChange={(event) => { setOffset(0); setCategoryId(event.target.value) }}>
            <option value="">Semua kategori</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-dari">Dari tanggal</label>
          <input className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary" id="filter-dari" type="date" value={from} onChange={(event) => { setOffset(0); setFrom(event.target.value) }} />
        </div>
        <div className="flex min-w-[min(100%,12rem)] grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="filter-sampai">Sampai tanggal</label>
          <input className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary" id="filter-sampai" type="date" value={to} onChange={(event) => { setOffset(0); setTo(event.target.value) }} />
        </div>
        {canManageCategories ? <Link className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary" href="/pengeluaran/kategori">Atur kategori</Link> : null}
      </div>

      {error ? <ErrorState title="Daftar pengeluaran gagal dimuat" body={error} action={<button className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface" type="button" onClick={() => void load()}>Coba lagi</button>} /> : null}
      {loading ? <p className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised" role="status">Memuat pengeluaran.</p> : null}
      {!loading && !error && expenses?.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada pengeluaran pada pilihan ini</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">Catat biaya operasional seperti sewa, listrik, atau transportasi. Pembelian barang dagangan melalui PO tetap dicatat di Pembelian.</p>
          {canManage ? <Link className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-transparent bg-secondary px-4 font-medium text-surface no-underline transition-colors hover:bg-secondary-deep" href="/pengeluaran/baru">Catat pengeluaran</Link> : null}
        </div>
      ) : null}
      {!loading && !error && expenses && expenses.length > 0 ? <>
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="text-[0.9375rem] text-text-secondary">Total pada pilihan ini, {total} catatan</p>
          <p className="text-2xl font-semibold tabular">{rupiah(totalAmount)}</p>
        </div>
        <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
          <table className="w-full border-collapse text-sm">
            <caption className="visually-hidden">Pengeluaran berdasarkan tanggal, kategori, deskripsi, dan nominal</caption>
            <thead className="bg-background text-text-secondary"><tr><th className="px-3 py-2 text-left font-semibold" scope="col">Tanggal</th><th className="px-3 py-2 text-left font-semibold" scope="col">Kategori dan deskripsi</th><th className="px-3 py-2 text-left font-semibold" scope="col">Referensi</th><th className="px-3 py-2 text-right font-semibold" scope="col">Nominal</th></tr></thead>
            <tbody>{expenses.map((expense) => <tr className="border-b border-border-subtle last:border-b-0" key={expense.id}>
              <td className="px-3 py-2 tabular">{expense.spentOn}</td>
              <td className="px-3 py-2"><Link href={`/pengeluaran/${expense.id}`}>{expense.categoryName}: {expense.description}</Link>{expense.purchaseOrderNumber ? <div className="text-sm text-text-secondary">Terkait {expense.purchaseOrderNumber}</div> : null}</td>
              <td className="px-3 py-2">{expense.reference ?? 'Tidak ada'}</td>
              <td className="px-3 py-2 text-right font-semibold tabular">{rupiah(expense.amount)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-3 desktop:hidden">{expenses.map((expense) => <li key={expense.id}>
          <Link className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised" href={`/pengeluaran/${expense.id}`}>
            <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold text-primary">{expense.categoryName}</span><span className="font-semibold tabular">{rupiah(expense.amount)}</span></span>
            <span>{expense.description}</span>
            <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm text-text-secondary tabular">{expense.spentOn}{expense.reference ? ` · ${expense.reference}` : ''}</span><span className="text-sm text-text-secondary">{expense.attachmentCount} lampiran</span></span>
          </Link>
        </li>)}</ul>
        <nav className="flex flex-wrap items-end gap-3" aria-label="Halaman pengeluaran">
          <span className="text-sm text-text-secondary">Menampilkan {offset + 1} sampai {Math.min(offset + PAGE_SIZE, total)} dari {total} pengeluaran</span>
          {offset > 0 ? <button className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface" type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Sebelumnya</button> : null}
          {offset + PAGE_SIZE < total ? <button className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface" type="button" onClick={() => setOffset(offset + PAGE_SIZE)}>Berikutnya</button> : null}
        </nav>
      </> : null}
    </ExpensesShell>
  )
}
