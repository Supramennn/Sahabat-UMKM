'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type SuppliersResponse } from '../../../lib/api'
import { cx } from '../../../lib/cx'
import { PurchasingShell } from '../pembelian-shell'

/**
 * PRD 6.3: supplier dengan nama, kontak, telepon, email, alamat, termin
 * pembayaran, catatan, dan status. Termin dipakai untuk menghitung jatuh tempo
 * utang supplier.
 */

const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium tabular'
const CARD = 'flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 text-text-primary no-underline shadow-raised'
const GROUP = 'flex min-w-0 flex-[1_1_12rem] flex-col gap-1'
const LABEL = 'text-[0.9375rem] font-medium text-text-primary'
const INPUT = 'min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary'
const LINK_BUTTON = 'inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary no-underline transition-colors hover:border-text-secondary'

interface SupplierForm {
  name: string
  contactName: string
  phone: string
  email: string
  address: string
  paymentTermDays: string
  note: string
}

const KOSONG: SupplierForm = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTermDays: '',
  note: '',
}

export default function SuppliersPage() {
  const app = useApp()
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<SuppliersResponse['suppliers'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<SupplierForm>(KOSONG)

  async function load() {
    const result = await apiGet<SuppliersResponse>(`/api/workspaces/${app.workspaceId}/suppliers`)
    if (result.ok) {
      setSuppliers(result.data.suppliers)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar supplier tidak bisa dimuat.'))
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

    const result = await apiPost<{ supplierId: number }>(
      `/api/workspaces/${app.workspaceId}/suppliers`,
      {
        name: form.name,
        contactName: form.contactName || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        paymentTermDays: form.paymentTermDays === '' ? null : Number(form.paymentTermDays),
        note: form.note || null,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Supplier tidak bisa disimpan.'))
      return
    }

    setForm(KOSONG)
    setSuccess('Supplier sudah disimpan.')
    await load()
    router.refresh()
  }

  return (
    <PurchasingShell
      activeHref="/pembelian/supplier"
      title="Supplier"
      actions={
        <a className={LINK_BUTTON} href="/pembelian/po">
          Buat PO
        </a>
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar supplier.
        </p>
      ) : suppliers && suppliers.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada supplier</p>
          <p className="text-[0.9375rem] text-text-secondary">
            Tambahkan supplier sebelum membuat purchase order. Data supplier dipakai untuk
            mencatat utang dan jatuh tempo pembayaran.
          </p>
        </div>
      ) : null}

      {!loading && suppliers && suppliers.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2 desktop:hidden">
            {suppliers.map((supplier) => (
              <li key={supplier.id} className={CARD}>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-primary">{supplier.name}</span>
                  {supplier.outstanding === null ? (
                    <span className={cx(BADGE, 'border-border-strong text-text-secondary')}>Utang tersedia di paket Usaha</span>
                  ) : supplier.outstanding > 0 ? (
                    <span className={cx(BADGE, 'border-warning text-warning')}>
                      Utang {formatRupiah(supplier.outstanding)}
                    </span>
                  ) : (
                    <span className={cx(BADGE, 'border-border-strong text-text-secondary')}>Lunas</span>
                  )}
                </span>
                <span className="text-sm text-text-secondary">
                  {[supplier.contactName, supplier.phone, supplier.email]
                    .filter(Boolean)
                    .join(' · ') || 'Kontak belum diisi'}
                </span>
                {supplier.paymentTermDays ? (
                  <span className="text-sm text-text-secondary tabular">
                    Termin {supplier.paymentTermDays} hari
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full border-collapse text-sm">
              <caption className="visually-hidden">Daftar supplier</caption>
              <thead className="bg-background text-left text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2">Supplier</th>
                  <th scope="col" className="px-3 py-2">Kontak</th>
                  <th scope="col" className="px-3 py-2">Termin</th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Utang
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2">{supplier.name}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      {supplier.contactName ?? supplier.phone ?? 'Belum diisi'}
                    </td>
                    <td className="px-3 py-2 text-text-secondary tabular">
                      {supplier.paymentTermDays ? `${supplier.paymentTermDays} hari` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {supplier.outstanding === null ? 'Tersedia di paket Usaha' : formatRupiah(supplier.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <form className="flex max-w-[34rem] flex-col gap-4" onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold">Tambah supplier</h2>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="nama">
            Nama supplier
          </label>
          <input
            className={INPUT}
            id="nama"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            placeholder="Contoh: CV Sumber Pangan"
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="kontak">
            Nama kontak
          </label>
          <input
            className={INPUT}
            id="kontak"
            value={form.contactName}
            onChange={(event) => setForm({ ...form, contactName: event.target.value })}
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="telepon">
            Telepon
          </label>
          <input
            className={INPUT}
            id="telepon"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="email">
            Email
          </label>
          <input
            className={INPUT}
            id="email"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="termin">
            Termin pembayaran (hari)
          </label>
          <input
            className={INPUT}
            id="termin"
            type="number"
            inputMode="numeric"
            value={form.paymentTermDays}
            onChange={(event) => setForm({ ...form, paymentTermDays: event.target.value })}
            placeholder="Contoh: 30"
          />
        </div>

        <div className={GROUP}>
          <label className={LABEL} htmlFor="alamat">
            Alamat
          </label>
          <input
            className={INPUT}
            id="alamat"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>

        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 self-start rounded-control border border-transparent bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy || form.name.trim() === ''}
        >
          {busy ? 'Menyimpan' : 'Simpan supplier'}
        </button>
      </form>
    </PurchasingShell>
  )
}

function formatRupiah(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${amount < 0 ? '-' : ''}Rp${digits}`
}
