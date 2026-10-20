import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { planCatalog, planCodes } from '@sahabat/shared'
import { cx } from '../lib/cx'
import {
  barisPaket,
  catatanHarga,
  catatanKaki,
  catatanUjiCoba,
  hargaPaket,
  hero,
  idBagian,
  judulMasalah,
  leadMasalah,
  masalah,
  modul,
  modulLain,
  skenario,
  tagline,
  tautanBagian,
  tautanKaki,
  tautanMasuk,
  tanyaJawab,
  tombolKedua,
  tombolUtama,
} from '../lib/beranda'
import { PageTransition } from './components/motion'

/**
 * Beranda publik (PRD 11).
 *
 * Halaman ini komponen server tanpa state supaya seluruh isinya sudah ada di
 * HTML pertama: mesin pencari dan pembaca layar tidak perlu menunggu JavaScript.
 *
 * Yang sengaja tidak ada: testimoni, jumlah pengguna, logo pelanggan, dan tautan
 * ke halaman yang belum dibuat. PRD 5 dan K-07 melarang ketiganya selama buktinya
 * belum ada.
 */

const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITUS),
  title: 'Sahabat UMKM: stok, pembelian, dan laporan usaha',
  description: hero.penjelasan,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Sahabat UMKM',
    url: '/',
    title: 'Sahabat UMKM: stok, pembelian, dan laporan usaha',
    description: hero.penjelasan,
  },
}

/** Data terstruktur sebatas yang bisa dibuktikan: nama, alamat situs, dan harga katalog. */
const dataTerstruktur = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: 'Sahabat UMKM', url: SITUS },
    { '@type': 'WebSite', name: 'Sahabat UMKM', url: SITUS, inLanguage: 'id' },
    {
      '@type': 'SoftwareApplication',
      name: 'Sahabat UMKM',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'id',
      description: hero.penjelasan,
      offers: planCodes.map((code) => ({
        '@type': 'Offer',
        name: `Paket ${planCatalog[code].name}`,
        price: String(planCatalog[code].proposedMonthlyPrice),
        priceCurrency: 'IDR',
      })),
    },
  ],
}

function TombolTautan({
  href,
  children,
  utama = false,
}: {
  href: string
  children: ReactNode
  utama?: boolean
}) {
  return (
    <Link
      className={cx(
        'inline-flex min-h-touch items-center justify-center rounded-control border px-4 text-base font-medium transition-colors duration-150',
        utama
          ? 'border-transparent bg-secondary text-surface hover:bg-secondary-deep'
          : 'border-border-strong bg-surface text-primary hover:border-text-secondary',
      )}
      href={href}
    >
      {children}
    </Link>
  )
}

function gambarSampel(gambar: { src: string; alt: string; width: number; height: number }, utama = false) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <Image
        alt={gambar.alt}
        className="h-auto w-full rounded-surface border border-border-subtle bg-surface shadow-raised"
        height={gambar.height}
        priority={utama}
        sizes="(min-width: 64rem) 40rem, 100vw"
        src={gambar.src}
        width={gambar.width}
      />
      <figcaption className="text-sm text-text-secondary">
        Tangkapan layar aplikasi dengan data contoh.
      </figcaption>
    </figure>
  )
}

export default function Page() {
  const baris = barisPaket()

  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-background">
        <div className="mx-auto flex w-full max-w-[72rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <Link
            className="flex min-h-touch items-center text-lg font-semibold tracking-[-0.01em] text-primary"
            href="/"
          >
            Sahabat UMKM
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:order-last sm:gap-2">
            <Link
              className="flex min-h-touch items-center rounded-control px-2 text-[0.9375rem] text-text-secondary transition-colors duration-150 hover:text-primary"
              href={tautanMasuk.href}
            >
              {tautanMasuk.label}
            </Link>
            <TombolTautan href={tombolUtama.href} utama>
              {tombolUtama.label}
            </TombolTautan>
          </div>
          <nav aria-label="Bagian beranda" className="w-full sm:w-auto">
            <ul className="flex flex-wrap items-center gap-x-1">
              {tautanBagian.map((tautan) => (
                <li key={tautan.href}>
                  <a
                    className="flex min-h-touch items-center rounded-control px-2 text-[0.9375rem] text-text-secondary transition-colors duration-150 hover:text-primary"
                    href={tautan.href}
                  >
                    {tautan.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <PageTransition className="flex flex-col">
        <main className="flex flex-col">
          <section className="border-b border-border-subtle">
            <div className="mx-auto grid w-full max-w-[72rem] items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 desktop:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] desktop:gap-12">
              <div className="flex max-w-[34rem] flex-col gap-5">
                <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                  {hero.judul}
                </h1>
                <p className="text-lg text-text-secondary">{hero.penjelasan}</p>
                <div className="flex flex-wrap gap-3">
                  <TombolTautan href={tombolUtama.href} utama>
                    {tombolUtama.label}
                  </TombolTautan>
                  <TombolTautan href={tombolKedua.href}>{tombolKedua.label}</TombolTautan>
                </div>
                <p className="text-sm text-text-secondary">{hero.catatan}</p>
              </div>
              {gambarSampel(hero.gambar, true)}
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">{judulMasalah}</h2>
              <p className="mt-2 max-w-[44rem] text-[0.9375rem] text-text-secondary">{leadMasalah}</p>
              <dl className="mt-6 grid max-w-[64rem] gap-x-8 gap-y-6 min-[48rem]:grid-cols-3">
                {masalah.map((item) => (
                  <div className="border-t border-border-subtle pt-3" key={item.kebiasaan}>
                    <dt className="font-semibold text-text-primary">{item.kebiasaan}</dt>
                    <dd className="mt-1 text-[0.9375rem] text-text-secondary">{item.jawaban}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="scroll-mt-24 border-b border-border-subtle" id={idBagian.fitur}>
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-14">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Cara kerja tiap modul</h2>
              <div className="mt-8 flex flex-col gap-10 desktop:gap-14">
                {modul.map((item, urutan) => (
                  <article
                    className="grid items-center gap-6 desktop:grid-cols-2 desktop:gap-12"
                    key={item.nama}
                  >
                    <div
                      className={cx(
                        'flex min-w-0 flex-col gap-2',
                        urutan % 2 === 1 && 'desktop:order-last',
                      )}
                    >
                      <h3 className="text-xl font-semibold text-primary">{item.nama}</h3>
                      <p className="font-medium text-text-primary">{item.ringkas}</p>
                      <p className="text-[0.9375rem] text-text-secondary">{item.isi}</p>
                    </div>
                    {gambarSampel(item.gambar)}
                  </article>
                ))}
              </div>
              <p className="mt-10 max-w-[52rem] text-[0.9375rem] text-text-secondary">{modulLain}</p>
            </div>
          </section>

          <section className="scroll-mt-24 border-b border-border-subtle" id={idBagian.untukUsaha}>
            <div className="mx-auto grid w-full max-w-[72rem] gap-6 px-4 py-10 sm:px-6 sm:py-12 desktop:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] desktop:gap-12">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-primary">
                  Contoh alur untuk tiga jenis usaha
                </h2>
                <p className="mt-2 text-[0.9375rem] text-text-secondary">
                  Gambaran pemakaian, ditulis sebagai skenario dan bukan sebagai testimoni.
                </p>
              </div>
              <dl className="flex flex-col">
                {skenario.map((item, urutan) => (
                  <div
                    className={cx('border-t border-border-subtle py-4', urutan === 0 && 'pt-0')}
                    key={item.usaha}
                  >
                    <dt className="font-semibold text-text-primary">{item.usaha}</dt>
                    <dd className="mt-1 text-[0.9375rem] text-text-secondary">{item.alur}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="scroll-mt-24 border-b border-border-subtle" id={idBagian.harga}>
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Paket dan harga</h2>
              <p className="mt-2 max-w-[44rem] text-[0.9375rem] text-text-secondary">
                Harga yang sama dengan halaman paket di aplikasi. {catatanUjiCoba}
              </p>

              <table className="mt-6 hidden w-full border-collapse text-left text-[0.9375rem] desktop:table">
                <caption className="visually-hidden">
                  Perbandingan paket Gratis, Usaha, dan Bisnis
                </caption>
                <thead>
                  <tr className="border-b border-border-strong">
                    <th className="py-3 pr-4 align-bottom font-medium text-text-secondary" scope="col">
                      Paket
                    </th>
                    {planCodes.map((code) => {
                      const harga = hargaPaket(code)
                      return (
                        <th className="py-3 pr-4 align-top" key={code} scope="col">
                          <span className="block text-base font-semibold text-primary">
                            {planCatalog[code].name}
                          </span>
                          <span className="tabular block text-text-primary">{harga.utama}</span>
                          {harga.keterangan ? (
                            <span className="block text-sm font-normal text-text-secondary">
                              {harga.keterangan}
                            </span>
                          ) : null}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {baris.map((item) => (
                    <tr className="border-b border-border-subtle" key={item.label}>
                      <th className="py-2 pr-4 font-normal text-text-secondary" scope="row">
                        {item.label}
                      </th>
                      {planCodes.map((code) => (
                        <td className="tabular py-2 pr-4 text-text-primary" key={code}>
                          {item.nilai[code]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 flex flex-col gap-6 desktop:hidden">
                {planCodes.map((code) => {
                  const harga = hargaPaket(code)
                  return (
                    <section
                      className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
                      key={code}
                    >
                      <h3 className="text-lg font-semibold text-primary">{planCatalog[code].name}</h3>
                      <p className="tabular mt-1 text-base text-text-primary">{harga.utama}</p>
                      {harga.keterangan ? (
                        <p className="text-sm text-text-secondary">{harga.keterangan}</p>
                      ) : null}
                      <dl className="mt-3 flex flex-col">
                        {baris.map((item) => (
                          <div
                            className="flex justify-between gap-3 border-b border-border-subtle py-1 last:border-b-0"
                            key={item.label}
                          >
                            <dt className="text-sm text-text-secondary">{item.label}</dt>
                            <dd className="tabular text-sm font-medium text-text-primary">
                              {item.nilai[code]}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )
                })}
              </div>

              <ul className="mt-6 flex max-w-[52rem] flex-col gap-1 text-sm text-text-secondary">
                {catatanHarga.map((catatan) => (
                  <li key={catatan}>{catatan}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="scroll-mt-24 border-b border-border-subtle" id={idBagian.tanyaJawab}>
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">
                Pertanyaan yang sering diajukan
              </h2>
              <dl className="mt-6 max-w-[64rem] border-t border-border-subtle">
                {tanyaJawab.map((item) => (
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

      <footer className="mx-auto w-full max-w-[72rem] px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-base font-semibold text-primary">Sahabat UMKM</p>
            <p className="text-sm text-text-secondary">{tagline}</p>
          </div>
          <nav aria-label="Tautan kaki">
            <ul className="flex flex-wrap gap-x-4">
              {tautanKaki.map((tautan) => (
                <li key={tautan.href}>
                  <a
                    className="flex min-h-touch items-center text-[0.9375rem] text-text-secondary underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                    href={tautan.href}
                  >
                    {tautan.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-4 max-w-[52rem] text-sm text-text-secondary">{catatanKaki}</p>
      </footer>

      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataTerstruktur) }}
        type="application/ld+json"
      />
    </div>
  )
}
