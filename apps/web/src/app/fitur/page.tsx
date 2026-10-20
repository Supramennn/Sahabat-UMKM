import Link from 'next/link'
import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala } from '../components/situs'
import { leadFitur, modulFitur } from '../../lib/fitur'
import { catatanKaki, metadataSitus } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/fitur',
  judul: 'Fitur Sahabat UMKM',
  deskripsi: leadFitur,
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
                Fitur
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadFitur}</p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-6 sm:px-6">
              <ul className="flex flex-col">
                {modulFitur.map((modul) => (
                  <li className="border-b border-border-subtle py-5 first:pt-6" key={modul.slug}>
                    <h2 className="text-xl font-semibold text-primary">
                      <Link
                        className="underline-offset-4 transition-colors duration-150 hover:underline"
                        href={`/fitur/${modul.slug}`}
                      >
                        {modul.nama}
                      </Link>
                    </h2>
                    <p className="mt-1 max-w-[52rem] text-[0.9375rem] text-text-secondary">
                      {modul.keterangan}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
