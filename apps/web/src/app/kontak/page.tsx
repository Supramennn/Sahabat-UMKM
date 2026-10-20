import type { Metadata } from 'next'
import Link from 'next/link'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala } from '../components/situs'
import { leadKontak, penutupKontak, saluranKontak } from '../../lib/kontak'
import { catatanKaki, metadataSitus } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/kontak',
  judul: 'Kontak - Sahabat UMKM',
  deskripsi: 'Kanal dukungan yang tersedia hari ini dan catatan saluran yang masih disiapkan.',
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
                Kontak
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadKontak}</p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Saluran</h2>
              <dl className="mt-4 max-w-[60rem] border-t border-border-subtle">
                {saluranKontak.map((saluran) => (
                  <div className="grid gap-1 border-b border-border-subtle py-4 min-[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[48rem]:gap-8" key={saluran.judul}>
                    <dt className="font-semibold text-text-primary">{saluran.judul}</dt>
                    <dd className="text-[0.9375rem] text-text-secondary">
                      {saluran.tautan ? (
                        <Link
                          className="font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                          href={saluran.tautan}
                        >
                          {saluran.keadaan}
                        </Link>
                      ) : (
                        saluran.keadaan
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 max-w-[52rem] text-[0.9375rem] text-text-secondary">{penutupKontak}</p>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
