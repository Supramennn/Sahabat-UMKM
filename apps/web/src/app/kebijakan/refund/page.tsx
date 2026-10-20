import type { Metadata } from 'next'
import { HalamanKebijakan, metadataKebijakan } from '../halaman'
import { drafKeterangan, isiRingkasRefund } from '../../../lib/kebijakan'

export const metadata: Metadata = metadataKebijakan(
  '/kebijakan/refund',
  'Kebijakan Refund (draf) - Sahabat UMKM',
  'Ketentuan pengembalian dana langganan, sebagai draf sebelum peninjauan penasihat hukum; penagihan sendiri belum diaktifkan.',
)

export default function Page() {
  return (
    <HalamanKebijakan
      jalur="/kebijakan/refund"
      judul="Kebijakan Refund"
      deskripsi="Halaman ini diperikan supaya ketentuannya sudah tertulis dan tertaut dari halaman Harga sebelum pembayaran diaktifkan, bukan setelahnya."
      isi={
        <>
          <ul className="flex flex-col gap-3 text-[0.9375rem] text-text-secondary">
            {isiRingkasRefund.map((butir) => (
              <li className="border-t border-border-subtle pt-3" key={butir}>
                {butir}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[0.9375rem] text-text-secondary">{drafKeterangan}</p>
        </>
      }
    />
  )
}
