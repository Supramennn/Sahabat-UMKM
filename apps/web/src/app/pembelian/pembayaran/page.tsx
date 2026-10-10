'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type Supplier,
  type SuppliersResponse,
  type SupplierDebt,
} from '../../../lib/api'
import { PurchasingShell } from '../pembelian-shell'
import { rupiah } from '../bagian'
import styles from '../pembelian.module.css'

/**
 * PRD 6.3: pencatatan pembayaran supplier dengan tanggal, jumlah, metode, dan
 * referensi, plus tampilan sisa utang per supplier dan per PO beserta jatuh
 * tempo berdasarkan termin.
 *
 * A-08: kalau pembayaran tidak memilih PO, sistem mengalokasikan otomatis ke utang
 * paling lama lebih dulu dan menampilkan alokasinya supaya bisa diperiksa.
 */

const METHODS = ['Transfer', 'Tunai', 'Kartu', 'Cek', 'Lainnya'] as const

export default function SupplierPaymentsPage() {
  const app = useApp()

  const [debts, setDebts] = useState<SupplierDebt[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>(METHODS[0])
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [allocations, setAllocations] = useState<Array<{ orderId: number; amount: number }> | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  async function load() {
    const [daftarUtang, daftarSupplier] = await Promise.all([
      apiGet<{ debts: SupplierDebt[] }>(`/api/workspaces/${app.workspaceId}/supplier-debts`),
      apiGet<SuppliersResponse>(`/api/workspaces/${app.workspaceId}/suppliers`),
    ])

    if (daftarUtang.ok) {
      setDebts(daftarUtang.data.debts)
      setError(null)
    } else {
      setError(errorMessage(daftarUtang.error, 'Daftar utang tidak bisa dimuat.'))
    }

    if (daftarSupplier.ok) {
      setSuppliers(daftarSupplier.data.suppliers)
      setSupplierId((sebelumnya) => sebelumnya || String(daftarSupplier.data.suppliers[0]?.id ?? ''))
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
    setAllocations(null)

    const hasil = await apiPost<{
      number: string
      allocations: Array<{ orderId: number; amount: number }>
    }>(`/api/workspaces/${app.workspaceId}/supplier-payments`, {
      supplierId: Number(supplierId),
      amount,
      method,
      reference: reference || null,
    })

    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Pembayaran tidak bisa dicatat.'))
      return
    }

    setSuccess(`Pembayaran ${hasil.data.number} tersimpan.`)
    setAllocations(hasil.data.allocations)
    setAmount('')
    setReference('')
    await load()
  }

  const totalUtang = (debts ?? []).reduce((jumlah, item) => jumlah + item.outstanding, 0)
  const lewatJatuhTempo = (debts ?? []).filter((item) => (item.overdueDays ?? 0) > 0)

  return (
    <PurchasingShell activeHref="/pembelian/pembayaran" title="Pembayaran supplier">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {allocations && allocations.length > 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Pembayaran dialokasikan ke</p>
          <ul className={styles.list}>
            {allocations.map((allocation) => {
              const detail = debts?.find((item) => item.purchaseOrderId === allocation.orderId)
              return (
                <li key={allocation.orderId} className={styles.card}>
                  <span className={styles.cardName}>{detail?.orderNumber ?? `PO #${allocation.orderId}`}</span>
                  <span className={styles.cardMeta}>{rupiah(allocation.amount)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className={styles.actions}>
        <span className={`${styles.badge} ${badgeForDebt(totalUtang)}`}>
          Total utang {rupiah(totalUtang)}
        </span>
        {lewatJatuhTempo.length > 0 ? (
          <span className={`${styles.badge} ${styles.badgeDanger}`}>
            {lewatJatuhTempo.length} lewat jatuh tempo
          </span>
        ) : null}
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="supplier-bayar">
            Supplier
          </label>
          <select
            className={styles.select}
            id="supplier-bayar"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="jumlah-bayar">
            Jumlah yang dibayar
          </label>
          <input
            className={styles.input}
            id="jumlah-bayar"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            placeholder="Contoh: 500000"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="metode">
            Metode pembayaran
          </label>
          <select
            className={styles.select}
            id="metode"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {METHODS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="referensi">
            Nomor referensi (opsional)
          </label>
          <input
            className={styles.input}
            id="referensi"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Nomor transfer atau bukti bayar"
          />
        </div>

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || supplierId === '' || amount.trim() === ''}
        >
          {busy ? 'Menyimpan' : 'Catat pembayaran'}
        </button>
      </form>

      {loading ? (
        <p role="status">Memuat daftar utang.</p>
      ) : debts && debts.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Tidak ada utang supplier</p>
          <p className={styles.stateBody}>
            Utang muncul setelah barang diterima dari supplier dan belum dibayar.
          </p>
        </div>
      ) : null}

      {!loading && debts && debts.length > 0 ? (
        <>
          <h2 className={styles.cardName}>Utang berjalan</h2>
          <ul className={styles.list}>
            {debts.map((debt) => (
              <li key={`${debt.supplierId}-${debt.purchaseOrderId ?? 'tanpa-po'}`} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>
                    {debt.orderNumber ?? debt.supplierName}
                  </span>
                  <span
                    className={`${styles.badge} ${
                      (debt.overdueDays ?? 0) > 0 ? styles.badgeDanger : styles.badgePending
                    }`}
                  >
                    {debt.outstanding > 0 ? rupiah(debt.outstanding) : 'Lunas'}
                  </span>
                </span>
                <span className={styles.cardMeta}>
                  {debt.supplierName}
                  {debt.dueOn ? ` · jatuh tempo ${debt.dueOn}` : ' · tanpa termin'}
                  {(debt.overdueDays ?? 0) > 0 ? ` · lewat ${debt.overdueDays} hari` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </PurchasingShell>
  )
}

/** Utang nol tampil sebagai lunas, bukan sebagai angka nol yang membingungkan. */
function badgeForDebt(total: number): string {
  return total > 0 ? (styles.badgePending ?? '') : (styles.badgeOk ?? '')
}
