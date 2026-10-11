'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/app-context'
import { Alert } from '@/components/ui'
import { apiGet, apiPatch, apiPost, errorMessage, type Customer } from '@/lib/api'
import { SalesShell } from '../penjualan-shell'
import styles from '../penjualan.module.css'

interface CustomerForm {
  name: string
  phone: string
  email: string
  address: string
  note: string
}

const KOSONG: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  note: '',
}

export default function CustomersPage() {
  const app = useApp()
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<CustomerForm>(KOSONG)

  async function load() {
    const result = await apiGet<{ customers: Customer[] }>(
      `/api/workspaces/${app.workspaceId}/customers?includeArchived=true`,
    )
    if (result.ok) {
      setCustomers(result.data.customers)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar pelanggan tidak bisa dimuat.'))
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

    const result = await apiPost<{ customerId: number }>(
      `/api/workspaces/${app.workspaceId}/customers`,
      {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        note: form.note || null,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Pelanggan tidak bisa disimpan.'))
      return
    }

    setForm(KOSONG)
    setSuccess('Pelanggan sudah disimpan.')
    await load()
    router.refresh()
  }

  async function gantiArsip(customer: Customer, arsip: boolean) {
    if (
      arsip &&
      !window.confirm(
        `Arsipkan pelanggan ${customer.name}? Pelanggan yang diarsipkan tidak muncul saat mencatat penjualan, tetapi riwayatnya tetap tersimpan.`,
      )
    ) {
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPatch<{ message: string }>(
      `/api/workspaces/${app.workspaceId}/customers/${customer.id}`,
      { isArchived: arsip },
    )

    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Status pelanggan tidak bisa diubah.'))
      return
    }

    setSuccess(arsip ? `Pelanggan ${customer.name} diarsipkan.` : `Pelanggan ${customer.name} diaktifkan kembali.`)
    await load()
    router.refresh()
  }

  return (
    <SalesShell activeHref="/penjualan/pelanggan" title="Pelanggan">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar pelanggan.</p>
      ) : customers && customers.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada pelanggan</p>
          <p className={styles.stateBody}>
            Tambahkan pelanggan untuk mencatat nama pada penjualan. Pelanggan opsional: penjualan
            walk-in tetap bisa dicatat tanpa pelanggan.
          </p>
        </div>
      ) : null}

      {!loading && customers && customers.length > 0 ? (
        <>
          <ul className={styles.list}>
            {customers.map((customer) => (
              <li key={customer.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{customer.name}</span>
                  {customer.archived ? (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Diarsipkan</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeOk}`}>Aktif</span>
                  )}
                </span>
                <span className={styles.cardMeta}>
                  {customer.phone ?? customer.email ?? 'Kontak belum diisi'}
                </span>
                {customer.address && <span className={styles.cardMeta}>{customer.address}</span>}
                {customer.note && <span className={styles.cardMeta}>Catatan: {customer.note}</span>}
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={busy}
                    onClick={() => void gantiArsip(customer, !customer.archived)}
                  >
                    {customer.archived ? 'Aktifkan kembali' : 'Arsipkan'}
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>Daftar pelanggan</caption>
              <thead>
                <tr>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Kontak</th>
                  <th scope="col">Alamat</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td className={styles.muted}>
                      {customer.phone ?? customer.email ?? '-'}
                    </td>
                    <td className={styles.muted}>{customer.address ?? '-'}</td>
                    <td className={styles.muted}>{customer.archived ? 'Diarsipkan' : 'Aktif'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>Tambah pelanggan</h2>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama">Nama pelanggan</label>
          <input
            className={styles.input}
            id="nama"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Contoh: PT Maju Jaya"
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="telepon">Telepon</label>
          <input
            className={styles.input}
            id="telepon"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            className={styles.input}
            id="email"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="alamat">Alamat</label>
          <input
            className={styles.input}
            id="alamat"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="catatan">Catatan</label>
          <input
            className={styles.input}
            id="catatan"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>

        <button type="submit" className={styles.submit} disabled={busy || form.name.trim() === ''}>
          {busy ? 'Menyimpan' : 'Simpan pelanggan'}
        </button>
      </form>
    </SalesShell>
  )
}