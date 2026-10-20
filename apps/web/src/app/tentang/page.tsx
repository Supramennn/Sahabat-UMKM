import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala, TombolTautan } from '../components/situs'
import { batasTentang, leadTentang, prinsipTentang } from '../../lib/tentang'
import { catatanKaki, metadataSitus } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/tentang',
  judul: 'Tentang - Sahabat UMKM',
  deskripsi:
    'Aplikasi pencatatan stok, pembelian, penjualan, dan pengeluaran untuk usaha kecil, dengan riwayat yang tidak bisa diubah.',
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
                Tentang Sahabat UMKM
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadTentang}</p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Prinsip yang diberlakukan</h2>
              <dl className="mt-4 max-w-[60rem] border-t border-border-subtle">
                {prinsipTentang.map((prinsip) => (
                  <div className="grid gap-1 border-b border-border-subtle py-4 min-[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[48rem]:gap-8" key={prinsip.judul}>
                    <dt className="font-semibold text-text-primary">{prinsip.judul}</dt>
                    <dd className="text-[0.9375rem] text-text-secondary">{prinsip.isi}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Batas yang dinyatakan terus terang</h2>
              <ul className="mt-4 flex max-w-[60rem] flex-col gap-3 text-[0.9375rem] text-text-secondary">
                {batasTentang.map((batas) => (
                  <li className="border-t border-border-subtle pt-3" key={batas}>
                    {batas}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <TombolTautan href="/fitur" utama>
                  Lihat fitur
                </TombolTautan>
                <TombolTautan href="/bantuan">Pusat Bantuan</TombolTautan>
              </div>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
