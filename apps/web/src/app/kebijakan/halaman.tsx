import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala } from '../components/situs'
import { catatanKaki, metadataSitus } from '../../lib/situs'
import { drafKeterangan } from '../../lib/kebijakan'

/**
 * Cangkang halaman dokumen kebijakan (PRD 15): setiap dokumen dinyatakan draf
 * di atas isinya supaya tidak ada halaman yang terbaca sebagai perjanjian
 * berlaku sebelum peninjauan penasihat hukum selesai.
 */

export function HalamanKebijakan({
  judul,
  deskripsi,
  kepala,
  isi,
}: {
  /** `jalur` dipakai helper metadata, bukan di komponen. */
  jalur: string
  judul: string
  deskripsi: string
  kepala?: string
  isi: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <SitusKepala />
      <PageTransition className="flex flex-col">
        <main className="flex flex-col">
          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-14">
              <h1 className="max-w-[30rem] text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                {judul}
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{deskripsi}</p>
              <aside className="mt-6 max-w-[52rem] rounded-surface border border-border-strong bg-surface p-4">
                <p className="text-[0.9375rem] font-medium text-text-primary">Draf, belum berlaku.</p>
                <p className="mt-1 text-[0.9375rem] text-text-secondary">{drafKeterangan}</p>
              </aside>
              {kepala ? (
                <p className="mt-6 max-w-[52rem] text-[0.9375rem] text-text-primary">{kepala}</p>
              ) : null}
            </div>
          </section>
          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">{isi}</div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}

export function metadataKebijakan(jalur: string, judul: string, deskripsi: string): Metadata {
  return metadataSitus({ jalur, judul, deskripsi })
}
