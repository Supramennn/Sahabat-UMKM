'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type Customer, type CustomersResponse } from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { rupiah } from '../bagian'
import styles from '../penjualan.module.css'

/**
 * PRD 5: Penjualan > Pelanggan. Pelanggan bersifat opsional pada penjualan, jadi
 * halaman ini harus tetap berguna kalau workspace tidak pernah memakainya: daftar
 * kosong menjelaskan bahwa penjualan tanpa pelanggan tetap bisa dicatat.
 */

export default function CustomersPage() {
  const app = useApp()

  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const muat = useCallback(async () => {
    setLoading(true)
    const hasil = await apiGet<CustomersResponse>(`/api/workspaces/${app.workspaceId}/customers`)

    setLoading(false)
    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Daftar pelanggan tidak bisa dimuat.'))
      return
    }
    setError(null)
    setCustomers(hasil.data.customers)
  }, [app.workspaceId])

  useEffect(() => {
    void muat()
  }, [muat])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setNameError(null)

    if (name.trim().length < 2) {
      setNameError('Nama pelanggan minimal 2 karakter.')
      return
    }

    setBusy(true)
    const hasil = await apiPost<{ customerId: number }>(
      `/api/workspaces/${app.workspaceId}/customers`,
      { name, phone, note },
    )
    setBusy(false)

    if (!hasil.ok) {
      setError(errorMessage(hasil.error, 'Pelanggan tidak bisa disimpan.'))
      return
    }

    setSuccess(`Pelanggan ${name.trim()} ditambahkan.`)
    setName('')
    setPhone('')
    setNote('')
    await muat()
  }

  return (
    <SalesShell
      activeHref="/penjualan/pelanggan"
      title="Pelanggan"
      actions={
        <Link className={styles.submit} href="/penjualan/baru">
          Catat penjualan
        </Link>
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="pelanggan-nama">
            Nama
          </label>
          <input
            className={styles.input}
            id="pelanggan-nama"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'pelanggan-nama-error' : undefined}
          />
          {nameError ? (
            <p className={styles.hint} id="pelanggan-nama-error" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="pelanggan-telepon">
            Telepon
          </label>
          <input
            className={styles.input}
            id="pelanggan-telepon"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="pelanggan-catatan">
            Catatan
          </label>
          <input
            className={styles.input}
            id="pelanggan-catatan"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Menyimpan' : 'Tambah pelanggan'}
        </button>
      </form>

      {loading ? <p role="status">Memuat daftar pelanggan.</p> : null}

      {error && customers ? (
        <ErrorState
          title="Daftar pelanggan gagal dimuat"
          body={error}
          action={
            <button type="button" className={styles.linkButton} onClick={() => void muat()}>
              Coba lagi
            </button>
          }
        />
      ) : null}

      {!loading && customers && customers.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Belum ada pelanggan</p>
          <p className={styles.stateBody}>
            Pelanggan opsional. Penjualan tetap bisa dicatat sebagai penjualan umum, dan
            menambahkan nama membuat laporan per pelanggan bisa dibaca nanti.
          </p>
          <div className={styles.emptyActions}>
            <Link className={styles.linkButton} href="/penjualan/baru">
              Catat penjualan umum
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && customers && customers.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>
                Daftar pelanggan beserta jumlah dan total pembeliannya
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Telepon</th>
                  <th scope="col" className={styles.numeric}>
                    Pembelian
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.phone ?? '-'}</td>
                    <td className={styles.numeric}>{customer.saleCount}</td>
                    <td className={styles.numeric}>{rupiah(customer.saleTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={styles.list}>
            {customers.map((customer) => (
              <li key={customer.id} className={styles.card}>
                <span className={styles.cardRow}>
                  <span className={styles.cardName}>{customer.name}</span>
                  <span className={styles.cardTotal}>{rupiah(customer.saleTotal)}</span>
                </span>
                <span className={styles.cardMeta}>
                  {customer.phone ?? 'Tanpa telepon'} · {customer.saleCount} pembelian
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </SalesShell>
  )
}