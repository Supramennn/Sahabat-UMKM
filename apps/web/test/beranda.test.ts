import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hero, modul, semuaTautan, tanyaJawab } from '../src/lib/beranda'
import { hargaPaket } from '../src/lib/harga'

/**
 * Isi beranda publik (PRD 11).
 *
 * Yang diuji di sini janji yang tidak boleh rusak tanpa disadari: tautan hanya
 * menuju halaman yang benar-benar ada (PRD 5), gambar sampel diberi label data
 * contoh (K-07), harga dibaca dari katalog paket yang sama dengan aplikasi
 * (PRD 11 dan PRD 16), dan pertanyaan PRD 11 tetap terpasang.
 */

const akar = fileURLToPath(new URL('..', import.meta.url))

/** Rute halaman yang benar-benar ada, dibaca dari direktori app. */
function ruteHalaman(): Set<string> {
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
  kunjungi(join(akar, 'src', 'app'), '')
  return hasil
}

describe('tautan beranda (PRD 5)', () => {
  it('menunjuk halaman yang ada', () => {
    const halaman = [...ruteHalaman()]

    for (const tautan of semuaTautan) {
      const path = tautan.href.split('?')[0]!.replace(/\/$/, '') || '/'
      expect(halaman, `tautan ${tautan.label} menunjuk halaman yang ada`).toContain(path)
    }
  })

  it('tidak lagi memakai loncatan ke bagian beranda', () => {
    for (const tautan of semuaTautan) {
      expect(tautan.href.startsWith('#'), `tautan ${tautan.label}`).toBe(false)
    }
  })
})

describe('gambar sampel beranda (K-07)', () => {
  const gambar = [hero.gambar, ...modul.map((item) => item.gambar)]

  it('menyebut data contoh pada teks alternatif', () => {
    for (const item of gambar) {
      expect(item.alt.toLowerCase(), item.src).toContain('data contoh')
    }
  })

  it('berkasnya ada dan ukurannya tetap', () => {
    for (const item of gambar) {
      expect(item.width, item.src).toBeGreaterThan(0)
      expect(item.height, item.src).toBeGreaterThan(0)
      const path = join(akar, 'public', item.src.replace(/^\//, ''))
      expect(existsSync(path), `berkas ${item.src} ada`).toBe(true)
    }
  })
})

describe('harga beranda (PRD 11 dan PRD 16)', () => {
  it('membaca nominal dari katalog paket yang sama dengan aplikasi', () => {
    expect(hargaPaket('gratis')).toEqual({ utama: 'Gratis', keterangan: null })
    expect(hargaPaket('usaha').utama).toBe('Rp99.000 / bulan')
    expect(hargaPaket('usaha').keterangan).toBe('Rp990.000 / tahun, setara 10 bulan')
    expect(hargaPaket('bisnis').keterangan).toBe('Rp2.490.000 / tahun, setara 10 bulan')
  })
})

describe('pertanyaan umum beranda (PRD 11)', () => {
  it('memuat pertanyaan yang diminta PRD dan satu jawaban tentang keadaan sebenarnya', () => {
    const pertanyaan = tanyaJawab.map((item) => item.tanya.toLowerCase()).join(' | ')
    const jawaban = tanyaJawab.map((item) => item.jawab.toLowerCase()).join(' | ')

    expect(pertanyaan).toContain('diekspor')
    expect(pertanyaan).toContain('sinyal')
    expect(pertanyaan).toContain('akuntansi')
    expect(pertanyaan).toContain('disimpan')
    expect(jawaban).toContain('cadangan')
  })

  it('tidak mengklaim klaim yang belum terbukti', () => {
    const teks = tanyaJawab.map((item) => item.jawab).join(' ')
    expect(teks.toLowerCase()).not.toContain('enskripsi saat tersimpan')
    expect(teks.toLowerCase()).not.toContain('backup otomatis')
  })
})
