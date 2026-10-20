import type { Metadata } from 'next'
import Link from 'next/link'
import { planCatalog, planCodes } from '@sahabat/shared'
import { cx } from '../lib/cx'
import {
  catatanHarga,
  catatanHargaUsulan,
  catatanKaki,
  catatanUjiCoba,
  hero,
  judulMasalah,
  leadMasalah,
  masalah,
  modul,
  modulLain,
  skenario,
  tanyaJawab,
  tombolKedua,
} from '../lib/beranda'
import { metadataSitus, tombolBuatAkun } from '../lib/situs'
import { GambarSampel, SitusKaki, SitusKepala, TombolTautan, TabelPaket } from './components/situs'
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

export const metadata: Metadata = metadataSitus({
  jalur: '/',
  judul: 'Sahabat UMKM: stok, pembelian, dan laporan usaha',
  deskripsi: hero.penjelasan,
})

const SITUS = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <SitusKepala />

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
                  <TombolTautan href={tombolBuatAkun.href} utama>
                    {tombolBuatAkun.label}
                  </TombolTautan>
                  <TombolTautan href={tombolKedua.href}>{tombolKedua.label}</TombolTautan>
                </div>
                <p className="text-sm text-text-secondary">{hero.catatan}</p>
              </div>
              <GambarSampel gambar={hero.gambar} utama />
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

          <section className="border-b border-border-subtle">
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
                      <Link
                        className="w-fit min-h-touch text-[0.9375rem] font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                        href={item.slug}
                      >
                        {item.tautanFungsi}
                      </Link>
                    </div>
                    <GambarSampel gambar={item.gambar} />
                  </article>
                ))}
              </div>
              <p className="mt-10 max-w-[52rem] text-[0.9375rem] text-text-secondary">
                {modulLain} Rincian modul lengkapnya ada di{' '}
                <Link
                  className="font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                  href="/fitur"
                >
                  halaman Fitur
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto grid w-full max-w-[72rem] gap-6 px-4 py-10 sm:px-6 sm:py-12 desktop:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] desktop:gap-12">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-primary">
                  Contoh alur untuk tiga jenis usaha
                </h2>
                <p className="mt-2 text-[0.9375rem] text-text-secondary">
                  Gambaran pemakaian, ditulis sebagai skenario dan bukan sebagai testimoni. Halaman{' '}
                  <Link
                    className="font-medium text-primary underline underline-offset-4 transition-colors duration-150 hover:text-text-secondary"
                    href="/untuk-usaha"
                  >
                    Untuk usaha F&amp;B dan retail
                  </Link>{' '}
                  memperluas skenario tersebut.
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

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Paket dan harga</h2>
              <p className="mt-2 max-w-[44rem] text-[0.9375rem] text-text-secondary">
                Harga yang sama dengan <Link className="underline underline-offset-4" href="/harga">halaman Harga</Link>{' '}
                dan halaman paket di aplikasi. {catatanUjiCoba}
              </p>

              <TabelPaket />

              <ul className="mt-6 flex max-w-[52rem] flex-col gap-1 text-sm text-text-secondary">
                {catatanHarga.map((catatan) => (
                  <li key={catatan}>{catatan}</li>
                ))}
                <li>{catatanHargaUsulan}</li>
              </ul>
            </div>
          </section>

          <section className="border-b border-border-subtle">
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

      <SitusKaki catatan={catatanKaki} />

      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataTerstruktur) }}
        type="application/ld+json"
      />
    </div>
  )
}
