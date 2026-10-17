'use client'

/**
 * Bagian yang dipakai beberapa halaman modul stok. Berada di berkas sendiri
 * karena berkas halaman Next.js hanya boleh mengekspor satu komponen default.
 */

/**
 * Jumlah barang ditampilkan dengan pemisah ribuan dan maksimal empat angka desimal.
 * Format ini bukan formatNumber dari packages/shared, karena jumlah barang boleh
 * pecahan (misal 1,5 kg) sementara format itu khusus bilangan bulat.
 */
export function formatQty(value: number): string {
  const bulat = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
  const [bagianBulat, bagianDesimal] = bulat.split('.')
  const denganPemisah = (bagianBulat ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return bagianDesimal ? `${denganPemisah},${bagianDesimal}` : denganPemisah
}

/**
 * Status stok selalu ditulis sebagai teks dan simbol, bukan hanya warna, supaya
 * tetap terbaca pada mode kontras paksa (PRD 10). Kelas warna di sini dipadukan
 * dengan bentuk dasar lencana di sisi pemanggil.
 */
export function badgeClass(status: string): string {
  if (status === 'habis') return 'border-danger text-danger'
  if (status === 'stok_rendah') return 'border-warning text-warning'
  return 'border-success text-success'
}

export function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number
  offset: number
  limit: number
  onChange: (offset: number) => void
}) {
  const dari = total === 0 ? 0 : offset + 1
  const sampai = Math.min(offset + limit, total)

  return (
    <nav
      className="flex flex-wrap items-center gap-3 text-sm text-text-secondary"
      aria-label="Halaman daftar"
    >
      <span>
        Menampilkan {dari} sampai {sampai} dari {total} data
      </span>
      {offset > 0 ? (
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </button>
      ) : null}
      {sampai < total ? (
        <button
          type="button"
          className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface px-4 font-medium text-primary transition-colors hover:border-text-secondary"
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </button>
      ) : null}
    </nav>
  )
}
