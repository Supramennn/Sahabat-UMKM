import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PANDUAN_MODUL, panduanBySlug, slugPanduanHalaman } from '../src/lib/panduan-modul'

/**
 * PRD 12: tur singkat per modul, bisa ditutup dan dipanggil ulang. PRD 5:
 * tautan hanya menunjuk halaman yang ada. Aturan bukti PRD 11: setiap kalimat
 * menyebut apa yang dikerjakan produk, tanpa angka atau klaim yang belum
 * bisa diverifikasi di kode.
 */

const akarWeb = fileURLToPath(new URL('..', import.meta.url))

/** Halaman aplikasi web yang benar-benar ada di src/app. */
function ruteAplikasi(): Set<string> {
  const hasil = new Set<string>()
  const kunjungi = (direktori: string, awalan: string): void => {
    for (const nama of readdirSync(direktori)) {
      const path = join(direktori, nama)
      if (statSync(path).isDirectory()) {
        kunjungi(path, `${awalan}/${nama}`)
        continue
      }
      if (nama === 'page.tsx') {
        hasil.add(awalan === '' ? '/' : awalan)
      }
    }
  }
  kunjungi(join(akarWeb, 'src', 'app'), '')
  return hasil
}

describe('panduan singkat per modul (PRD 12)', () => {
  const slug = PANDUAN_MODUL.map((panduan) => panduan.slug)

  it('slug dan halaman modulnya unik', () => {
    expect(new Set(slug).size).toBe(slug.length)
    expect(new Set(PANDUAN_MODUL.map((panduan) => panduan.activeHref)).size).toBe(slug.length)
  })

  it('semua tautan menunjuk halaman yang ada (PRD 5)', () => {
    const ada = ruteAplikasi()
    for (const panduan of PANDUAN_MODUL) {
      for (const tautan of panduan.tautan) {
        const path = tautan.href.split('?')[0]!.replace(/\/$/, '') || '/'
        expect(ada.has(path), `tautan "${tautan.label}" menunjuk ${tautan.href}`).toBe(true)
      }
    }
  })

  it('halaman modul tempat panel muncul juga ada', () => {
    for (const panduan of PANDUAN_MODUL) {
      expect(ruteAplikasi().has(panduan.activeHref), `panel untuk halaman ${panduan.activeHref}`).toBe(true)
    }
  })

  it('teks tidak memakai kata promosi kosong (aturan bukti PRD 11)', () => {
    const terlarang = ['revolusioner', 'mulus', 'canggih', 'terbaik', 'tercepat']
    for (const panduan of PANDUAN_MODUL) {
      for (const paragraf of panduan.paragraf) {
        for (const kata of terlarang) {
          expect(paragraf.toLowerCase(), `${panduan.slug}: kata ${kata}`).not.toContain(kata)
        }
      }
    }
  })

  it('teks bisa dibaca kembali lewat slug dan pemetaan halaman aktif', () => {
    expect(panduanBySlug('stok')?.judul).toBe('Modul Stok')
    expect(panduanBySlug('modul-tidak-ada')).toBeUndefined()
    expect(slugPanduanHalaman('/stok')).toBe('stok')
    expect(slugPanduanHalaman('/stok/input')).toBeUndefined()
    expect(slugPanduanHalaman('/dashboard')).toBeUndefined()
  })
})
