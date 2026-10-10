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
    <main
      style={{
        maxWidth: '48rem',
        margin: '0 auto',
        padding: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a',
        background: '#ffffff',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Purchase order</h1>
      <p style={{ marginTop: 0, color: '#4a4a4a' }}>
        {order.number} · {order.statusLabel}
      </p>

      <dl style={{ display: 'grid', gap: '0.25rem', margin: '1rem 0' }}>
        <div>
          <dt style={{ fontWeight: 600 }}>Pemesan</dt>
          <dd style={{ margin: 0 }}>{order.workspaceName}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600 }}>Supplier</dt>
          <dd style={{ margin: 0 }}>
            {order.supplierName}
            {order.supplierContactName ? ` · ${order.supplierContactName}` : ''}
            {order.supplierPhone ? ` · ${order.supplierPhone}` : ''}
          </dd>
        </div>
        {order.supplierAddress ? (
          <div>
            <dt style={{ fontWeight: 600 }}>Alamat supplier</dt>
            <dd style={{ margin: 0 }}>{order.supplierAddress}</dd>
          </div>
        ) : null}
        <div>
          <dt style={{ fontWeight: 600 }}>Tanggal order</dt>
          <dd style={{ margin: 0 }}>{order.orderedOn}</dd>
        </div>
        {order.expectedOn ? (
          <div>
            <dt style={{ fontWeight: 600 }}>Perkiraan tiba</dt>
            <dd style={{ margin: 0 }}>{order.expectedOn}</dd>
          </div>
        ) : null}
        <div>
          <dt style={{ fontWeight: 600 }}>Lokasi penyimpanan</dt>
          <dd style={{ margin: 0 }}>{order.locationName}</dd>
        </div>
      </dl>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <caption style={{ textAlign: 'left', fontWeight: 600, paddingBottom: '0.5rem' }}>
          Barang yang dipesan
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', borderBottom: '1px solid #999' }}>
              Barang
            </th>
            <th scope="col" style={{ textAlign: 'right', borderBottom: '1px solid #999' }}>
              Jumlah
            </th>
            <th scope="col" style={{ textAlign: 'right', borderBottom: '1px solid #999' }}>
              Harga satuan
            </th>
            <th scope="col" style={{ textAlign: 'right', borderBottom: '1px solid #999' }}>
              Jumlah nilai
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.sku}>
              <td style={{ borderBottom: '1px solid #ddd' }}>
                {item.productName}
                <br />
                <small style={{ color: '#4a4a4a' }}>{item.sku}</small>
              </td>
              <td style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                {quantity(item.quantity)} {item.unitCode}
              </td>
              <td style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                {rupiah(item.unitPrice)}
              </td>
              <td style={{ textAlign: 'right', borderBottom: '1px solid #ddd' }}>
                {rupiah(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, paddingTop: '0.5rem' }}>
              Total
            </td>
            <td style={{ textAlign: 'right', fontWeight: 600, paddingTop: '0.5rem' }}>
              {rupiah(order.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {order.note ? (
        <p style={{ marginTop: '1rem' }}>
          <strong>Catatan:</strong> {order.note}
        </p>
      ) : null}

      <p style={{ marginTop: '1.5rem' }}>
        <a href={pdfUrl} target="_blank" rel="noreferrer">
          Unduh versi PDF
        </a>
      </p>

      <p style={{ marginTop: '2rem', color: '#4a4a4a', fontSize: '0.875rem' }}>
        Halaman ini hanya untuk dibaca. Isinya tidak bisa diubah dari sini. Kalau tautan ini
        sudah tidak berlaku, minta pemilik toko mengirim ulang purchase order-nya.
      </p>
    </main>
  )
}

function TautanTidakBerlaku() {
  return (
    <main
      style={{
        maxWidth: '40rem',
        margin: '0 auto',
        padding: '2rem 1.5rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: '1.5rem' }}>Tautan sudah tidak berlaku</h1>
      <p style={{ color: '#4a4a4a' }}>
        Purchase order ini sudah kedaluwarsa atau tautannya sudah dicabut. Minta pemilik toko
        mengirim ulang tautan yang baru.
      </p>
    </main>
  )
}