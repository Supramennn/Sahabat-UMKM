import Link from 'next/link'
import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala, TombolTautan, TabelPaket } from '../components/situs'
import {
  catatanHarga,
  catatanHargaUsulan,
  catatanUjiCoba,
  kebijakanRefundTautan,
  tanyaJawabHarga,
} from '../../lib/harga'
import { catatanKaki, metadataSitus, tombolBuatAkun } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/harga',
  judul: 'Harga - Sahabat UMKM',
  deskripsi:
    'Tiga paket: Gratis, Usaha, dan Bisnis, dengan batas produk, anggota, dan lokasi yang sama dengan halaman paket di aplikasi.',
})

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <SitusKepala />
      <PageTransition className="flex flex-col">
        <main className="flex flex-col">
          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-14">
              <h1 className="max-w-[30rem] text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                Harga
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">
                Batas tiap paket di bawah sama dengan yang diberlakukan di aplikasi. {catatanUjiCoba}
              </p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <TabelPaket />
              <ul className="mt-6 flex max-w-[52rem] flex-col gap-1 text-sm text-text-secondary">
                {catatanHarga.map((catatan) => (
                  <li key={catatan}>{catatan}</li>
                ))}
                <li>{catatanHargaUsulan}</li>
                <li>
                  Ketentuan pengembalian dana menunggu peninjauan penasihat hukum dan tertulis di{' '}
                  <Link
                    className="font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                    href={kebijakanRefundTautan.href}
                  >
                    halaman Kebijakan Refund
                  </Link>
                  .
                </li>
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <TombolTautan href={tombolBuatAkun.href} utama>
                  {tombolBuatAkun.label}
                </TombolTautan>
                <TombolTautan href="/bantuan">Baca panduan di Pusat Bantuan</TombolTautan>
              </div>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">
                Pertanyaan tentang harga
              </h2>
              <dl className="mt-6 max-w-[64rem] border-t border-border-subtle">
                {tanyaJawabHarga.map((item) => (
                  <div
                    className="grid gap-1 border-b border-border-subtle py-4 min-[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[48rem]:gap-8"
                    key={item.tanya}
                  >
                    <dt className="font-semibold text-text-primary">{item.tanya}</dt>
                    <dd className="text-[0.9375rem] text-text-secondary">{item.jawab}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
