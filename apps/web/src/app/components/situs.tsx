import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Gambar } from '../../lib/beranda'
import {
  tagline,
  tautanKakiHalaman,
  tautanKakiKebijakan,
  tautanMasuk,
  tautanNavigasi,
  tombolBuatAkun,
} from '../../lib/situs'
import { barisPaket, hargaPaket } from '../../lib/harga'
import { planCatalog, planCodes } from '@sahabat/shared'
import type { PlanCode } from '@sahabat/shared'
import { cx } from '../../lib/cx'

/**
 * Komponen bersama halaman situs publik (header, kaki, tombol, gambar sampel,
 * dan tabel paket). Semuanya komponen server tanpa state supaya isi tetap ada
 * di HTML pertama (PRD 11 dan PRD 14).
 */

export function TombolTautan({
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

export function GambarSampel({ gambar, utama = false }: { gambar: Gambar; utama?: boolean }) {
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
      <figcaption className="text-sm text-text-secondary">Tangkapan layar aplikasi dengan data contoh.</figcaption>
    </figure>
  )
}

/** Header situs publik yang sama di semua halaman (PRD 11). */
export function SitusKepala() {
  return (
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
          <TombolTautan href={tombolBuatAkun.href} utama>
            {tombolBuatAkun.label}
          </TombolTautan>
        </div>
        <nav aria-label="Situs" className="w-full sm:w-auto">
          <ul className="flex flex-wrap items-center gap-x-1">
            {tautanNavigasi.map((tautan) => (
              <li key={tautan.href}>
                <Link
                  className="flex min-h-touch items-center rounded-control px-2 text-[0.9375rem] text-text-secondary transition-colors duration-150 hover:text-primary"
                  href={tautan.href}
                >
                  {tautan.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}

/** Kaki situs publik: tautan halaman dan tautan dokumen (PRD 11). */
export function SitusKaki({ catatan }: { catatan: string }) {
  return (
    <footer className="mx-auto w-full max-w-[72rem] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div>
          <p className="text-base font-semibold text-primary">Sahabat UMKM</p>
          <p className="text-sm text-text-secondary">{tagline}</p>
        </div>
        <nav aria-label="Tautan kaki">
          <ul className="flex max-w-[40rem] flex-wrap gap-x-4 gap-y-1">
            {tautanKakiHalaman.map((tautan) => (
              <li key={tautan.href}>
                <Link
                  className="flex min-h-touch items-center text-[0.9375rem] text-text-secondary underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                  href={tautan.href}
                >
                  {tautan.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <nav aria-label="Tautan dokumen">
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {tautanKakiKebijakan.map((tautan) => (
            <li key={tautan.href}>
              <Link
                className="flex min-h-touch items-center text-[0.9375rem] text-text-secondary underline underline-offset-4 transition-colors duration-150 hover:text-primary"
                href={tautan.href}
              >
                {tautan.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-4 max-w-[52rem] text-sm text-text-secondary">{catatan}</p>
    </footer>
  )
}

function gambarPaket(code: PlanCode) {
  const harga = hargaPaket(code)
  return (
    <th className="py-3 pr-4 align-top" key={code} scope="col">
      <span className="block text-base font-semibold text-primary">{planCatalog[code].name}</span>
      <span className="tabular block text-text-primary">{harga.utama}</span>
      {harga.keterangan ? (
        <span className="block text-sm font-normal text-text-secondary">{harga.keterangan}</span>
      ) : null}
    </th>
  )
}

function SelPaket({ code }: { code: PlanCode }) {
  const harga = hargaPaket(code)
  return (
    <div>
      <h3 className="text-lg font-semibold text-primary">{planCatalog[code].name}</h3>
      <p className="tabular mt-1 text-base text-text-primary">{harga.utama}</p>
      {harga.keterangan ? <p className="text-sm text-text-secondary">{harga.keterangan}</p> : null}
    </div>
  )
}

/** Tabel paket yang dipakai bersama beranda dan halaman Harga (PRD 11.6). */
export function TabelPaket() {
  const baris = barisPaket()
  return (
    <>
      <table className="mt-6 hidden w-full border-collapse text-left text-[0.9375rem] desktop:table">
        <caption className="visually-hidden">Perbandingan paket Gratis, Usaha, dan Bisnis</caption>
        <thead>
          <tr className="border-b border-border-strong">
            <th className="py-3 pr-4 align-bottom font-medium text-text-secondary" scope="col">
              Paket
            </th>
            {planCodes.map((code) => gambarPaket(code))}
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
        {planCodes.map((code) => (
          <section
            className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
            key={code}
          >
            <SelPaket code={code} />
            <dl className="mt-3 flex flex-col">
              {baris.map((item) => (
                <div
                  className="flex justify-between gap-3 border-b border-border-subtle py-1 last:border-b-0"
                  key={item.label}
                >
                  <dt className="text-sm text-text-secondary">{item.label}</dt>
                  <dd className="tabular text-sm font-medium text-text-primary">{item.nilai[code]}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  )
}
