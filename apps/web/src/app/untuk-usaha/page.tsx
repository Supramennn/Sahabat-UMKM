import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { GambarSampel, SitusKaki, SitusKepala, TombolTautan } from '../components/situs'
import { leadUntukUsaha, bagianUsaha, penutupUntukUsaha } from '../../lib/untuk-usaha'
import { catatanKaki, metadataSitus, tombolBuatAkun } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/untuk-usaha',
  judul: 'Untuk usaha F&B dan retail - Sahabat UMKM',
  deskripsi: leadUntukUsaha,
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
                Untuk usaha F&amp;B dan retail
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadUntukUsaha}</p>
            </div>
          </section>

          {bagianUsaha.map((bagian) => (
            <section className="border-b border-border-subtle" key={bagian.kelompok}>
              <div className="mx-auto grid w-full max-w-[72rem] gap-8 px-4 py-10 sm:px-6 sm:py-12 desktop:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] desktop:gap-12">
                <div className="flex max-w-[32rem] flex-col gap-6">
                  <h2 className="text-2xl font-semibold tracking-tight text-primary">{bagian.kelompok}</h2>
                  <p className="text-[0.9375rem] text-text-secondary">{bagian.lead}</p>
                  {bagian.skenario.map((skenario) => (
                    <div className="border-t border-border-subtle pt-4" key={skenario.nama}>
                      <h3 className="text-lg font-semibold text-primary">{skenario.nama}</h3>
                      <p className="mt-1 font-medium text-text-primary">{skenario.lead}</p>
                      <ul className="mt-2 flex flex-col gap-2 text-[0.9375rem] text-text-secondary">
                        {skenario.butir.map((butir) => (
                          <li key={butir}>{butir}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                  <GambarSampel gambar={bagian.gambar} />
                </div>
              </div>
            </section>
          ))}

          <section className="border-b border-border-subtle">
            <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
              <p className="max-w-[52rem] text-[0.9375rem] text-text-secondary">{penutupUntukUsaha}</p>
              <div className="flex flex-wrap gap-3">
                <TombolTautan href={tombolBuatAkun.href} utama>
                  {tombolBuatAkun.label}
                </TombolTautan>
                <TombolTautan href="/harga">Lihat paket dan harga</TombolTautan>
              </div>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
