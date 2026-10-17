import type { Metadata } from 'next'
import { API_BASE } from '../../../lib/api'

/**
 * Halaman publik purchase order (PRD 6.3, A-11).
 *
 * Halaman ini tidak punya sesi. Yang membukanya hanya token di alamat, dan token
 * itu punya masa berlaku serta bisa dicabut. Karena isinya bisa dibaca siapa pun
 * yang punya alamatnya, halaman ini tidak boleh diindeks mesin pencari (A-11)
 * dan tidak boleh disimpan di cache perantara.
 *
 * Halaman dimulai dari server supaya isinya sudah ada ketika dibuka, supaya
 * supplier tidak melihat halaman kosong lalu harus menekan muat ulang.
 */

interface PublicOrder {
  number: string
  statusLabel: string
  orderedOn: string
  expectedOn: string | null
  totalAmount: number
  supplierName: string
  supplierContactName: string | null
  supplierPhone: string | null
  supplierEmail: string | null
  supplierAddress: string | null
  locationName: string
  workspaceName: string
  note: string | null
  items: Array<{
    productName: string
    sku: string
    unitCode: string
    quantity: number
    unitPrice: number
    discountAmount: number
    lineTotal: number
  }>
}

export const metadata: Metadata = {
  title: 'Purchase order',
  // A-11: halaman ini tidak boleh masuk indeks mesin pencari.
  robots: { index: false, follow: false, nocache: true },
}

function rupiah(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${amount < 0 ? '-' : ''}Rp${digits}`
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

export default async function PublicPurchaseOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params

  const response = await fetch(`${API_BASE}/api/public/purchase-orders/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    return <TautanTidakBerlaku />
  }

  const order = (await response.json()) as PublicOrder
  const pdfUrl = `${API_BASE}/api/public/purchase-orders/${encodeURIComponent(token)}/pdf`

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-3xl rounded-surface border border-border-subtle bg-surface p-6 shadow-raised sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase order</h1>
        <p className="mt-1 text-text-secondary">
          {order.number} · {order.statusLabel}
        </p>

        <dl className="mt-6 grid gap-1">
          <div>
            <dt className="font-semibold">Pemesan</dt>
            <dd>{order.workspaceName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Supplier</dt>
            <dd>
              {order.supplierName}
              {order.supplierContactName ? ` · ${order.supplierContactName}` : ''}
              {order.supplierPhone ? ` · ${order.supplierPhone}` : ''}
            </dd>
          </div>
          {order.supplierAddress ? (
            <div>
              <dt className="font-semibold">Alamat supplier</dt>
              <dd>{order.supplierAddress}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold">Tanggal order</dt>
            <dd className="tabular">{order.orderedOn}</dd>
          </div>
          {order.expectedOn ? (
            <div>
              <dt className="font-semibold">Perkiraan tiba</dt>
              <dd className="tabular">{order.expectedOn}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold">Lokasi penyimpanan</dt>
            <dd>{order.locationName}</dd>
          </div>
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <caption className="pb-2 text-left font-semibold">Barang yang dipesan</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border-strong pb-1 text-left">
                Barang
              </th>
              <th scope="col" className="border-b border-border-strong pb-1 text-right">
                Jumlah
              </th>
              <th scope="col" className="border-b border-border-strong pb-1 text-right">
                Harga satuan
              </th>
              <th scope="col" className="border-b border-border-strong pb-1 text-right">
                Jumlah nilai
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.sku}>
                <td className="border-b border-border-subtle py-1.5">
                  {item.productName}
                  <br />
                  <small className="text-text-secondary">{item.sku}</small>
                </td>
                <td className="border-b border-border-subtle py-1.5 text-right tabular">
                  {quantity(item.quantity)} {item.unitCode}
                </td>
                <td className="border-b border-border-subtle py-1.5 text-right tabular">
                  {rupiah(item.unitPrice)}
                </td>
                <td className="border-b border-border-subtle py-1.5 text-right tabular">
                  {rupiah(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-2 text-right font-semibold">
                Total
              </td>
              <td className="pt-2 text-right font-semibold tabular">{rupiah(order.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {order.note ? (
          <p className="mt-4">
            <strong>Catatan:</strong> {order.note}
          </p>
        ) : null}

        <p className="mt-6">
          <a
            className="inline-flex min-h-touch items-center text-secondary underline underline-offset-4"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            Unduh versi PDF
          </a>
        </p>

        <p className="mt-8 text-sm text-text-secondary">
          Halaman ini hanya untuk dibaca. Isinya tidak bisa diubah dari sini. Kalau tautan ini
          sudah tidak berlaku, minta pemilik toko mengirim ulang purchase order-nya.
        </p>
      </div>
    </main>
  )
}

function TautanTidakBerlaku() {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-16">
      <div className="w-full max-w-2xl rounded-surface border border-border-subtle bg-surface p-6 shadow-raised">
        <h1 className="text-2xl font-semibold tracking-tight">Tautan sudah tidak berlaku</h1>
        <p className="mt-2 text-text-secondary">
          Purchase order ini sudah kedaluwarsa atau tautannya sudah dicabut. Minta pemilik toko
          mengirim ulang tautan yang baru.
        </p>
      </div>
    </main>
  )
}
