'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type SubscriptionResponse,
  type Supplier,
  type SuppliersResponse,
  type SupplierDebt,
} from '../../../lib/api'
import { cx } from '../../../lib/cx'
import { PurchasingShell } from '../pembelian-shell'
import { rupiah } from '../bagian'
import { can } from '@sahabat/shared'

/**
 * PRD 6.3: pencatatan pembayaran supplier dengan tanggal, jumlah, metode, dan
 * referensi, plus tampilan sisa utang per supplier dan per PO beserta jatuh
 * tempo berdasarkan termin.
 *
 * A-08: kalau pembayaran tidak memilih PO, sistem mengalokasikan otomatis ke utang
 * paling lama lebih dulu dan menampilkan alokasinya supaya bisa diperiksa.
 */

const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'
const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const GROUP = 'flex min-w-0 flex-[1_1_12rem] flex-col gap-1'
const LABEL = 'text-[0.9375rem] font-medium text-text-primary'
const INPUT = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary'
const PRIMARY_BUTTON = 'min-h-touch cursor-pointer rounded-control bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface'

const METHODS = ['Transfer', 'Tunai', 'Kartu', 'Cek', 'Lainnya'] as const

export default function SupplierPaymentsPage() {
  const app = useApp()
  const enabled = can(app.role, 'reports.debt')

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
  const [plan, setPlan] = useState<SubscriptionResponse['subscription']['plan'] | null>(null)

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
    void apiGet<SubscriptionResponse>(`/api/workspaces/${app.workspaceId}/subscription`).then((result) => {
      if (result.ok) {
        setPlan(result.data.subscription.plan)
        if (enabled) void load()
        else setLoading(false)
      } else {
        setError(errorMessage(result.error, 'Informasi paket tidak bisa dimuat.'))
        setLoading(false)
      }
    })
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
      {plan === 'gratis' ? <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
        <p className="font-semibold">Pembayaran dan utang tersedia di paket Usaha</p>
        <p className="text-[0.9375rem] text-text-secondary">Data pembelian tetap tersimpan. Pilih paket Usaha untuk mencatat pembayaran dan melihat saldo utang supplier.</p>
        <a className="inline-flex min-h-touch self-start items-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary" href="/pengaturan/paket">Lihat paket</a>
      </div> : plan !== null && enabled ? <>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {allocations && allocations.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Pembayaran dialokasikan ke</p>
          <ul className="flex flex-col gap-2">
            {allocations.map((allocation) => {
              const detail = debts?.find((item) => item.purchaseOrderId === allocation.orderId)
              return (
                <li key={allocation.orderId} className={CARD}>
                  <span className="font-semibold text-primary tabular">{detail?.orderNumber ?? `PO #${allocation.orderId}`}</span>
                  <span className="text-sm text-text-secondary tabular">{rupiah(allocation.amount)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className={cx(BADGE, badgeForDebt(totalUtang))}>
          Total utang {rupiah(totalUtang)}
        </span>
        {lewatJatuhTempo.length > 0 ? (
          <span className={cx(BADGE, 'border-danger text-danger')}>
            {lewatJatuhTempo.length} lewat jatuh tempo
          </span>
        ) : null}
      </div>

      <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit}>
        <div className={GROUP}>
          <label className={LABEL} htmlFor="supplier-bayar">
            Supplier
          </label>
          <select
            className={INPUT}
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

        <div className={GROUP}>
          <label className={LABEL} htmlFor="jumlah-bayar">
            Jumlah yang dibayar
          </label>
          <input
            className={INPUT}
            id="jumlah-bayar"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            placeholder="Contoh: 500000"
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="metode">
            Metode pembayaran
          </label>
          <select
            className={INPUT}
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

        <div className={GROUP}>
          <label className={LABEL} htmlFor="referensi">
            Nomor referensi (opsional)
          </label>
          <input
            className={INPUT}
            id="referensi"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Nomor transfer atau bukti bayar"
          />
        </div>

        <button
          type="submit"
          className={cx(PRIMARY_BUTTON, 'self-start')}
          disabled={busy || supplierId === '' || amount.trim() === ''}
        >
          {busy ? 'Menyimpan' : 'Catat pembayaran'}
        </button>
      </form>

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar utang.
        </p>
      ) : debts && debts.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Tidak ada utang supplier</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Utang muncul setelah barang diterima dari supplier dan belum dibayar.
          </p>
        </div>
      ) : null}

      {!loading && debts && debts.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold">Utang berjalan</h2>
          <ul className="flex flex-col gap-2">
            {debts.map((debt) => (
              <li key={`${debt.supplierId}-${debt.purchaseOrderId ?? 'tanpa-po'}`} className={CARD}>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-primary tabular">
                    {debt.orderNumber ?? debt.supplierName}
                  </span>
                  <span
                    className={cx(
                      BADGE,
                      (debt.overdueDays ?? 0) > 0 ? 'border-danger text-danger' : 'border-warning text-warning',
                    )}
                  >
                    {debt.outstanding > 0 ? rupiah(debt.outstanding) : 'Lunas'}
                  </span>
                </span>
                <span className="text-sm text-text-secondary tabular">
                  {debt.supplierName}
                  {debt.dueOn ? ` · jatuh tempo ${debt.dueOn}` : ' · tanpa termin'}
                  {(debt.overdueDays ?? 0) > 0 ? ` · lewat ${debt.overdueDays} hari` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      </> : loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat paket dan pembayaran supplier.
        </p>
      ) : null}
    </PurchasingShell>
  )
}

/** Utang nol tampil sebagai lunas, bukan sebagai angka nol yang membingungkan. */
function badgeForDebt(total: number): string {
  return total > 0 ? 'border-warning text-warning' : 'border-success text-success'
}
