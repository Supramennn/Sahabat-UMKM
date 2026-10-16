'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { Alert } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type SuppliersResponse } from '../../../lib/api'
import { PurchasingShell } from '../pembelian-shell'
import styles from '../pembelian.module.css'

/**
 * PRD 6.3: supplier dengan nama, kontak, telepon, email, alamat, termin
 * pembayaran, catatan, dan status. Termin dipakai untuk menghitung jatuh tempo
 * utang supplier.
 */

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
        <a className={styles.paginationLink} href="/pembelian/po">
          Buat PO
        </a>
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar supplier.</p>
      ) : suppliers && suppliers.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada supplier</p>
          <p className={styles.stateBody}>
            Tambahkan supplier sebelum membuat purchase order. Data supplier dipakai untuk
            mencatat utang dan jatuh tempo pembayaran.
          </p>
        </div>
      ) : null}

      {!loading && suppliers && suppliers.length > 0 ? (
        <>
          <ul className={styles.list}>
            {suppliers.map((supplier) => (
              <li key={supplier.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{supplier.name}</span>
                  {supplier.outstanding === null ? (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Utang tersedia di paket Usaha</span>
                  ) : supplier.outstanding > 0 ? (
                    <span className={`${styles.badge} ${styles.badgePending}`}>
                      Utang {formatRupiah(supplier.outstanding)}
                    </span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Lunas</span>
                  )}
                </span>
                <span className={styles.cardMeta}>
                  {[supplier.contactName, supplier.phone, supplier.email]
                    .filter(Boolean)
                    .join(' · ') || 'Kontak belum diisi'}
                </span>
                {supplier.paymentTermDays ? (
                  <span className={styles.cardMeta}>
                    Termin {supplier.paymentTermDays} hari
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Daftar supplier</caption>
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Kontak</th>
                  <th scope="col">Termin</th>
                  <th scope="col" className={styles.numeric}>
                    Utang
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.name}</td>
                    <td className={styles.muted}>
                      {supplier.contactName ?? supplier.phone ?? 'Belum diisi'}
                    </td>
                    <td className={styles.muted}>
                      {supplier.paymentTermDays ? `${supplier.paymentTermDays} hari` : '-'}
                    </td>
                    <td className={styles.numeric}>
                      {supplier.outstanding === null ? 'Tersedia di paket Usaha' : formatRupiah(supplier.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>Tambah supplier</h2>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama">
            Nama supplier
          </label>
          <input
            className={styles.input}
            id="nama"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            placeholder="Contoh: CV Sumber Pangan"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="kontak">
            Nama kontak
          </label>
          <input
            className={styles.input}
            id="kontak"
            value={form.contactName}
            onChange={(event) => setForm({ ...form, contactName: event.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="telepon">
            Telepon
          </label>
          <input
            className={styles.input}
            id="telepon"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            className={styles.input}
            id="email"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="termin">
            Termin pembayaran (hari)
          </label>
          <input
            className={styles.input}
            id="termin"
            type="number"
            inputMode="numeric"
            value={form.paymentTermDays}
            onChange={(event) => setForm({ ...form, paymentTermDays: event.target.value })}
            placeholder="Contoh: 30"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="alamat">
            Alamat
          </label>
          <input
            className={styles.input}
            id="alamat"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>

        <button type="submit" className={styles.submit} disabled={busy || form.name.trim() === ''}>
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
