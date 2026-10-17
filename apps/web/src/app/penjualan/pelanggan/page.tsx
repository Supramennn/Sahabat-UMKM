'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useApp } from '../../components/app-context'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, apiPost, errorMessage, type Customer, type CustomersResponse } from '../../../lib/api'
import { SalesShell } from '../penjualan-shell'
import { rupiah } from '../bagian'

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
        <Link
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control bg-secondary px-4 font-medium text-surface transition-colors hover:bg-secondary-deep"
          href="/penjualan/baru"
        >
          Catat penjualan
        </Link>
      }
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      <form className="flex max-w-[46rem] flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="pelanggan-nama">
            Nama
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="pelanggan-nama"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'pelanggan-nama-error' : undefined}
          />
          {nameError ? (
            <p className="text-sm text-danger" id="pelanggan-nama-error" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="pelanggan-telepon">
            Telepon
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="pelanggan-telepon"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="pelanggan-catatan">
            Catatan
          </label>
          <input
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
            id="pelanggan-catatan"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <button
          type="submit"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control bg-secondary px-4 text-base font-medium text-surface transition-colors duration-150 enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
          disabled={busy}
        >
          {busy ? 'Menyimpan' : 'Tambah pelanggan'}
        </button>
      </form>

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar pelanggan.
        </p>
      ) : null}

      {error && customers ? (
        <ErrorState
          title="Daftar pelanggan gagal dimuat"
          body={error}
          action={
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center self-start rounded-control border border-border-strong bg-surface px-4 text-base font-medium text-primary transition-colors duration-150 enabled:hover:border-text-secondary disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              onClick={() => void muat()}
            >
              Coba lagi
            </button>
          }
        />
      ) : null}

      {!loading && customers && customers.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Belum ada pelanggan</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Pelanggan opsional. Penjualan tetap bisa dicatat sebagai penjualan umum, dan
            menambahkan nama membuat laporan per pelanggan bisa dibaca nanti.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
              href="/penjualan/baru"
            >
              Catat penjualan umum
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && customers && customers.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-surface border border-border-subtle bg-surface shadow-raised desktop:block">
            <table className="w-full text-sm">
              <caption className="visually-hidden">
                Daftar pelanggan beserta jumlah dan total pembeliannya
              </caption>
              <thead className="bg-background text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Nama
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Telepon
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Pembelian
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold tabular">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-3 py-2">{customer.name}</td>
                    <td className="px-3 py-2">{customer.phone ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular">{customer.saleCount}</td>
                    <td className="px-3 py-2 text-right tabular">{rupiah(customer.saleTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0 desktop:hidden">
            {customers.map((customer) => (
              <li
                key={customer.id}
                className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[1.0625rem] font-semibold text-primary">{customer.name}</span>
                  <span className="font-semibold tabular">{rupiah(customer.saleTotal)}</span>
                </span>
                <span className="text-sm text-text-secondary">
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
