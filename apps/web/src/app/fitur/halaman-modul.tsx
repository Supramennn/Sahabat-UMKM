import Link from 'next/link'
import type { Metadata } from 'next'
import { GambarSampel, SitusKaki, SitusKepala, TombolTautan } from '../components/situs'
import { PageTransition } from '../components/motion'
import type { ModulFitur } from '../../lib/fitur'
import { catatanKaki, metadataSitus, tombolBuatAkun } from '../../lib/situs'

/**
 * Halaman satu modul fitur (PRD 5 dan PRD 11). Komposisinya menurut sifat
 * isinya: modul harian dipaparkan sebagai daftar fungsi, modul pendukung
 * dipaparkan satu paragraf, sesuai B-12.
 */

export function HalamanModulFitur({ modul }: { modul: ModulFitur }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <SitusKepala />
      <PageTransition className="flex flex-col">
        <main className="flex flex-col">
          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <p className="text-sm text-text-secondary">
                <Link
                  className="underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                  href="/fitur"
                >
                  Fitur
                </Link>{' '}
                / {modul.nama}
              </p>
              <h1 className="mt-2 max-w-[30rem] text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                {modul.nama}
              </h1>
              <p className="mt-4 max-w-[42rem] text-lg text-text-secondary">{modul.lead}</p>
            </div>
          </section>

          {modul.gambar ? (
            <section className="border-b border-border-subtle">
              <div className="mx-auto w-full max-w-[64rem] px-4 py-8 sm:px-6 sm:py-10">
                <GambarSampel gambar={modul.gambar} />
              </div>
            </section>
          ) : null}

          {modul.poin ? (
            <section className="border-b border-border-subtle">
              <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
                <h2 className="text-2xl font-semibold tracking-tight text-primary">Fungsi di modul ini</h2>
                <ul className="mt-4 flex max-w-[60rem] flex-col gap-3 text-[0.9375rem] text-text-secondary">
                  {modul.poin.map((poin) => (
                    <li className="border-t border-border-subtle pt-3" key={poin}>
                      {poin}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {modul.paragraf ? (
            <section className="border-b border-border-subtle">
              <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
                <p className="max-w-[52rem] text-[0.9375rem] text-text-secondary">{modul.paragraf}</p>
              </div>
            </section>
          ) : null}

          <section className="border-b border-border-subtle">
            <div className="mx-auto flex w-full max-w-[72rem] flex-wrap items-center gap-3 px-4 py-8 sm:px-6">
              <h2 className="w-full text-lg font-semibold text-primary sm:w-auto">Lanjut ke</h2>
              <TombolTautan href="/bantuan">Panduan pemakaian di Pusat Bantuan</TombolTautan>
              <TombolTautan href={tombolBuatAkun.href} utama>
                {tombolBuatAkun.label}
              </TombolTautan>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}

export function metadataModul(modul: ModulFitur): Metadata {
  return metadataSitus({
    jalur: `/fitur/${modul.slug}`,
    judul: `Fitur ${modul.nama} - Sahabat UMKM`,
    deskripsi: modul.lead,
  })
}
