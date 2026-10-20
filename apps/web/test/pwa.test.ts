import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * PRD 10: aplikasi dapat dipasang sebagai PWA dan halaman yang sudah dimuat
 * tetap bisa dibuka saat sinyal hilang. Yang diuji: manifest lengkap dan hanya
 * memakai warna token PRD 10, ikon benar-benar ada, PNG valid dengan ukuran
 * pas, serta aturan service worker tidak menyentuh API pada asal lain dan tidak
 * menyajikan data basi ke pengguna.
 */

const akarPublik = join(fileURLToPath(new URL('../public', import.meta.url)))

interface BagianPng {
  tipe: string
  isi: Buffer
}

function bagianPng(jalur: string): BagianPng[] {
  const isi = readFileSync(jalur)
  expect(isi.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n')
  const hasil: BagianPng[] = []
  let kursor = 8
  while (kursor < isi.length) {
    const panjang = isi.readUInt32BE(kursor)
    const tipe = isi.subarray(kursor + 4, kursor + 8).toString('latin1')
    hasil.push({ tipe, isi: isi.subarray(kursor + 8, kursor + 8 + panjang) })
    kursor += 12 + panjang
  }
  return hasil
}

const MANIFEST = JSON.parse(readFileSync(join(akarPublik, 'manifest.webmanifest'), 'utf8')) as Record<string, unknown>

describe('manifest PWA (PRD 10)', () => {
  it('punya nama, mulai di dashboard, berdiri sendiri, dan warna token PRD 10', () => {
    expect(MANIFEST.name).toBe('Sahabat UMKM')
    expect(MANIFEST.start_url).toBe('/dashboard')
    expect(MANIFEST.scope).toBe('/')
    expect(MANIFEST.display).toBe('standalone')
    expect(MANIFEST.background_color).toBe('#F7F9FC')
    expect(MANIFEST.theme_color).toBe('#172B4D')
    expect(MANIFEST.lang).toBe('id')
  })

  it('ikon yang ditunjuk benar-benar ada dan PNG ukuran pas', () => {
    const ikon = MANIFEST.icons as Array<{ src: string; sizes: string; purpose: string }>
    expect(ikon.some((item) => item.purpose === 'any')).toBe(true)
    expect(ikon.some((item) => item.purpose === 'maskable')).toBe(true)

    for (const deklarasi of ikon) {
      const jalur = join(akarPublik, deklarasi.src.replace(/^\//, ''))
      const bagian = bagianPng(jalur)
      const ihdr = bagian.find((potong) => potong.tipe === 'IHDR')!

      const lebar = ihdr.isi.readUInt32BE(0)
      const tinggi = ihdr.isi.readUInt32BE(4)
      const [ukuran] = deklarasi.sizes.split('x')
      expect(lebar, deklarasi.src).toBe(Number(ukuran))
      expect(tinggi, deklarasi.src).toBe(Number(ukuran))

      const idat = bagian.filter((potong) => potong.tipe === 'IDAT')
      const piksel = inflateSync(Buffer.concat(idat.map((potong) => potong.isi)))
      expect(piksel.length, deklarasi.src).toBe(tinggi * (lebar * 4 + 1))
    }
  })

  it('ikon apple touch yang dipasang di layout juga tersedia', () => {
    const apple = bagianPng(join(akarPublik, 'ikon', 'apple-touch-icon.png'))
    const ihdr = apple.find((potong) => potong.tipe === 'IHDR')!
    expect(ihdr.isi.readUInt32BE(0)).toBe(180)
  })
})

describe('aturan service worker (PRD 10)', () => {
  const isi = readFileSync(join(akarPublik, 'sw.js'), 'utf8')

  it('menyimpan offline.html saat dipasang dan mengambil salinan hanya untuk navigasi', () => {
    expect(isi).toContain("'/offline.html'")
    expect(isi).toContain("permintaan.mode === 'navigate'")
  })

  it('tidak pernah menyentuh asal lain, tempat API berada', () => {
    expect(isi).toContain('url.origin !== self.location.origin')
  })

  it('aset lain satu asal memakai jaringan dulu, salinan hanya penyelamat', () => {
    const bagianSenada = isi.indexOf('// Aset lain satu asal')
    expect(bagianSenada).toBeGreaterThan(-1)
    const rentang = isi.slice(bagianSenada)
    const indeksFetch = rentang.indexOf('await fetch(permintaan)')
    const indeksSalinan = rentang.indexOf('caches.match(permintaan)')
    expect(indeksFetch).toBeGreaterThan(-1)
    expect(indeksSalinan).toBeGreaterThan(indeksFetch)
  })

  it('metode non-GET dan berkas updater tidak disangga sama sekali', () => {
    expect(isi).toContain("permintaan.method !== 'GET'")
    expect(isi).toContain("'/sw.js'")
    expect(isi).toContain("'/manifest.webmanifest'")
  })
})

describe('berkas pendukung', () => {
  it('offline.html punya satu judul utama dan teksnya jujur soal halaman yang belum pernah dibuka', () => {
    const isi = readFileSync(join(akarPublik, 'offline.html'), 'utf8')
    expect((isi.match(/<h1/g) ?? []).length).toBe(1)
    expect(isi).toContain('belum pernah dibuka')
  })

  it('folder ikon tidak membawa berkas tambahan', () => {
    const daftar = readdirSync(join(akarPublik, 'ikon')).sort()
    expect(daftar).toEqual(['apple-touch-icon.png', 'ikon-192.png', 'ikon-512.png', 'ikon-maskable-192.png', 'ikon-maskable-512.png'])
  })
})
