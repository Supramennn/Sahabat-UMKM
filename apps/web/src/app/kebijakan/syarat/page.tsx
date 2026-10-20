import type { Metadata } from 'next'
import { HalamanKebijakan, metadataKebijakan } from '../halaman'
import { drafKeterangan, emailKerjaTidakTersedia, isiRingkasSyarat } from '../../../lib/kebijakan'

export const metadata: Metadata = metadataKebijakan(
  '/kebijakan/syarat',
  'Syarat dan Ketentuan (draf) - Sahabat UMKM',
  'Aturan pemakaian layanan pencatatan, batas paket, dan tanggung jawab pemegang akun, sebagai draf sebelum peninjauan penasihat hukum.',
)

export default function Page() {
  return (
    <HalamanKebijakan
      jalur="/kebijakan/syarat"
      judul="Syarat dan Ketentuan"
      deskripsi="Draf ini menuliskan aturan pemakaian sesuai perilaku layanan di kode hari ini, dan diganti segera setelah peninjauan penasihat hukum selesai."
      kepala={emailKerjaTidakTersedia}
      isi={
        <>
          <ul className="flex flex-col gap-3 text-[0.9375rem] text-text-secondary">
            {isiRingkasSyarat.map((butir) => (
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
