import type { Metadata } from 'next'
import { HalamanKebijakan, metadataKebijakan } from '../halaman'
import { drafKeterangan, emailKerjaTidakTersedia, privasi } from '../../../lib/kebijakan'

export const metadata: Metadata = metadataKebijakan(
  '/kebijakan/privasi',
  'Kebijakan Privasi (draf) - Sahabat UMKM',
  'Data yang diproses, tempat penyimpanan, siapa yang dapat melihat, masa simpan, dan hak Anda, sebagai draf sebelum peninjauan penasihat hukum.',
)

export default function Page() {
  return (
    <HalamanKebijakan
      jalur="/kebijakan/privasi"
      judul="Kebijakan Privasi"
      deskripsi="Draf ini menuliskan cara aplikasi memproses data sesuai perilaku yang ada di kode hari ini, dan diganti segera setelah peninjauan penasihat hukum selesai."
      kepala={emailKerjaTidakTersedia}
      isi={
        <>
          {privasi.map((bagian) => (
            <div className="border-b border-border-subtle py-6 last:border-b-0" key={bagian.bagian}>
              <h2 className="text-lg font-semibold text-primary">{bagian.bagian}</h2>
              <ul className="mt-2 flex flex-col gap-2 text-[0.9375rem] text-text-secondary">
                {bagian.daftar.map((butir) => (
                  <li key={butir}>{butir}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-6 text-[0.9375rem] text-text-secondary">{drafKeterangan}</p>
        </>
      }
    />
  )
}
