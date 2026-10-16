'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost, errorMessage, type ExpenseCategoriesResponse, type PurchaseOrder, type PurchaseOrdersResponse } from '../../../lib/api'
import { can } from '@sahabat/shared'
import { Alert, ErrorState } from '../../components/ui'
import { useApp } from '../../components/app-context'
import { ExpensesShell } from '../pengeluaran-shell'
import styles from '../pengeluaran.module.css'
import { looksLikeStockPurchase, stockPurchaseWarning } from '@sahabat/shared'

export default function NewExpensePage() {
  const app = useApp()
  const allowed = can(app.role, 'expenses.manage')
  const router = useRouter()
  const [categories, setCategories] = useState<ExpenseCategoriesResponse['categories']>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState('')
  const [reference, setReference] = useState('')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warningAccepted, setWarningAccepted] = useState(false)

  useEffect(() => {
    let stopped = false
    Promise.all([
      apiGet<ExpenseCategoriesResponse>(`/api/workspaces/${app.workspaceId}/expense-categories`),
      apiGet<PurchaseOrdersResponse>(`/api/workspaces/${app.workspaceId}/purchase-orders?limit=100&status=diterima`),
    ]).then(([categoryResult, orderResult]) => {
      if (stopped) return
      if (categoryResult.ok) setCategories(categoryResult.data.categories)
      else setCategoriesError(errorMessage(categoryResult.error, 'Kategori tidak bisa dimuat.'))
      if (orderResult.ok) setOrders(orderResult.data.orders)
    })
    return () => { stopped = true }
  }, [app.workspaceId])

  const selectedCategory = categories.find((category) => String(category.id) === categoryId)?.name ?? categoryName
  const warning = selectedCategory && looksLikeStockPurchase(selectedCategory) ? stockPurchaseWarning(selectedCategory) : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (warning && !warningAccepted) {
      setError('Periksa peringatan pembelian stok sebelum menyimpan. Jika ini biaya lain, Anda dapat melanjutkan setelah mengonfirmasi.')
      return
    }
    setBusy(true)
    const result = await apiPost<{ expenseId: number }>(`/api/workspaces/${app.workspaceId}/expenses`, {
      spentOn: spentOn || null,
      categoryId: categoryId ? Number(categoryId) : null,
      categoryName: categoryId ? null : categoryName || null,
      description,
      amount,
      reference: reference || null,
      purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
    })
    setBusy(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Pengeluaran tidak bisa disimpan.'))
      return
    }
    router.push(`/pengeluaran/${result.data.expenseId}`)
  }

  if (categoriesError) {
    return <ExpensesShell activeHref="/pengeluaran" title="Catat pengeluaran"><ErrorState title="Formulir belum bisa dibuka" body={categoriesError} /></ExpensesShell>
  }

  if (!allowed) {
    return <ExpensesShell activeHref="/pengeluaran" title="Catat pengeluaran"><ErrorState title="Anda tidak punya izin mencatat pengeluaran" body="Minta Owner atau Admin workspace untuk mencatat pengeluaran." /></ExpensesShell>
  }

  return (
    <ExpensesShell activeHref="/pengeluaran" title="Catat pengeluaran">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {warning ? <div className={styles.warning} role="note"><p>{warning}</p><label><input type="checkbox" checked={warningAccepted} onChange={(event) => setWarningAccepted(event.target.checked)} /> Ini biaya lain, bukan pembelian barang dagangan.</label></div> : null}
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.formRow}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="expense-date">Tanggal</label>
            <input className={styles.input} id="expense-date" type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="expense-category">Kategori yang sudah ada</label>
            <select className={styles.select} id="expense-category" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setCategoryName(''); setWarningAccepted(false) }}>
              <option value="">Ketik kategori baru atau lanjut tanpa kategori</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        </div>
        {!categoryId ? <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="expense-category-name">Nama kategori (opsional)</label>
          <input className={styles.input} id="expense-category-name" value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setWarningAccepted(false) }} maxLength={120} />
        </div> : null}
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="expense-description">Deskripsi</label>
          <input className={styles.input} id="expense-description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={2} maxLength={300} required />
        </div>
        <div className={styles.formRow}>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="expense-amount">Nominal (Rupiah)</label>
            <input className={`${styles.input} ${styles.amountInput}`} id="expense-amount" type="text" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="150000" required />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.label} htmlFor="expense-reference">Referensi (opsional)</label>
            <input className={styles.input} id="expense-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} />
          </div>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="expense-order">Tautkan ke purchase order (opsional)</label>
          <select className={styles.select} id="expense-order" value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)}>
            <option value="">Tidak ditautkan</option>
            {orders.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.supplierName}</option>)}
          </select>
          <p className={styles.hint}>Satu purchase order hanya dapat ditautkan ke satu pengeluaran.</p>
        </div>
        <button className={styles.button} type="submit" disabled={busy || Boolean(warning && !warningAccepted)}>{busy ? 'Menyimpan' : 'Simpan pengeluaran'}</button>
      </form>
    </ExpensesShell>
  )
}
