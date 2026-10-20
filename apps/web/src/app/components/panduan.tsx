'use client'

import { useEffect, useState } from 'react'
import { type PanduanModul } from '../../lib/panduan-modul'

/**
 * Panel panduan singkat per modul (PRD 12: tur singkat saat modul pertama
 * dibuka, bisa ditutup dan dipanggil ulang).
 *
 * Tutup tersimpan di localStorage peramban, karena ini hanya pilihan tampilan,
 * bukan data workspace. Setelah ditutup, teks yang sama bisa dibaca lagi dari
 * halaman Lainnya di bagian Panduan singkat per modul.
 */

function kunciTutup(slug: string): string {
  return `sahabat-panduan-tutup-${slug}`
}

export function PanelPanduanModul({ panduan }: { panduan: PanduanModul }) {
  const [tertutup, setTertutup] = useState<boolean | null>(null)

  // Keadaan tersimpan dibaca setelah mount supaya HTML server dan render
  // pertama klien tidak berbeda (tidak ada kedipan panel saat penuh halaman).
  useEffect(() => {
    try {
      setTertutup(window.localStorage.getItem(kunciTutup(panduan.slug)) === '1')
    } catch {
      // Penyimpanan bisa ditutup situs: panel tetap tampil, tidak mengganggu.
      setTertutup(false)
    }
  }, [panduan.slug])

  if (tertutup) return null

  function tutup() {
    try {
      window.localStorage.setItem(kunciTutup(panduan.slug), '1')
    } catch {
      // Gagal menyimpan pilihan tidak mematahkan apa pun; panel tutup saja.
    }
    setTertutup(true)
  }

  return (
    <section
      aria-labelledby={`judul-panduan-${panduan.slug}`}
      className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold" id={`judul-panduan-${panduan.slug}`}>
          Panduan singkat. {panduan.judul}
        </h2>
        <button
          type="button"
          className="min-h-touch cursor-pointer bg-transparent px-2 text-[0.9375rem] font-medium text-secondary underline enabled:hover:decoration-2"
          onClick={tutup}
        >
          Tutup panduan
        </button>
      </div>
      {panduan.paragraf.map((paragraf) => (
        <p key={paragraf.slice(0, 24)} className="text-[0.9375rem] text-text-secondary">
          {paragraf}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {panduan.tautan.map((tautan) => (
          <a
            key={tautan.href + tautan.label}
            className="inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-3 text-[0.9375rem] font-medium text-secondary transition-colors duration-150 hover:border-text-secondary"
            href={tautan.href}
          >
            {tautan.label}
          </a>
        ))}
      </div>
      <p className="text-sm text-text-secondary">
        Panduan ini tampil sekali untuk modul ini dan bisa dipanggil ulang dari menu Lainnya, bagian panduan per modul.
      </p>
    </section>
  )
}
