import Link from 'next/link'
import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala } from '../components/situs'
import { bagianBantuan, leadBantuan, masalahUmum } from '../../lib/bantuan'
import { catatanKaki, metadataSitus } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/bantuan',
  judul: 'Pusat Bantuan - Sahabat UMKM',
  deskripsi: 'Panduan pemakaian per modul dan penyelesaian masalah umum, dalam Bahasa Indonesia.',
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
                Pusat Bantuan
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadBantuan}</p>
              <nav aria-label="Daftar isi bantuan" className="mt-6">
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-text-secondary">
                  {bagianBantuan.map((bagian) => (
                    <li key={bagian.judul}>
                      <a
                        className="underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                        href={`#${bagian.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      >
                        {bagian.judul}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a
                      className="underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                      href="#masalah-umum"
                    >
                      Masalah umum
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </section>

          {bagianBantuan.map((bagian) => (
            <section
              className="scroll-mt-24 border-b border-border-subtle"
              id={bagian.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              key={bagian.judul}
            >
              <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
                <h2 className="text-2xl font-semibold tracking-tight text-primary">{bagian.judul}</h2>
                {bagian.lead ? (
                  <p className="mt-2 max-w-[44rem] text-[0.9375rem] text-text-secondary">{bagian.lead}</p>
                ) : null}
                <ul className="mt-4 flex max-w-[60rem] flex-col gap-3 text-[0.9375rem] text-text-secondary">
                  {bagian.butir.map((butir) => (
                    <li className="border-t border-border-subtle pt-3" key={butir.judul}>
                      <span className="font-semibold text-text-primary">{butir.judul}. </span>
                      {butir.isi}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          <section className="scroll-mt-24 border-b border-border-subtle" id="masalah-umum">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Masalah umum</h2>
              <dl className="mt-4 max-w-[60rem] border-t border-border-subtle">
                {masalahUmum.map((butir) => (
                  <div className="grid gap-1 border-b border-border-subtle py-4 min-[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[48rem]:gap-8" key={butir.judul}>
                    <dt className="font-semibold text-text-primary">{butir.judul}</dt>
                    <dd className="text-[0.9375rem] text-text-secondary">{butir.isi}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 max-w-[52rem] text-[0.9375rem] text-text-secondary">
                Masalah yang belum terjawab di halaman ini bisa dilaporkan setelah saluran dukungan{' '}
                <Link
                  className="font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                  href="/kontak"
                >
                  dipasang di halaman Kontak
                </Link>
                .
              </p>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
