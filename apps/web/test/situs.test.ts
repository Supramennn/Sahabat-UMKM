import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  catatanHarga,
  catatanHargaUsulan,
  catatanUjiCoba,
  kebijakanRefundTautan,
  tanyaJawabHarga,
} from '../src/lib/harga'
import { modulBySlug, modulFitur } from '../src/lib/fitur'
import { bagianBantuan, masalahUmum } from '../src/lib/bantuan'
import { batasTentang, prinsipTentang } from '../src/lib/tentang'
import { komponenStatus, leadStatus } from '../src/lib/status'
import { leadKontak, saluranKontak } from '../src/lib/kontak'
import { drafKeterangan, isiRingkasRefund, isiRingkasSyarat } from '../src/lib/kebijakan'
import {
  catatanKaki,
  metadataSitus,
  tagline,
  tautanKakiHalaman,
  tautanKakiKebijakan,
  tautanNavigasi,
  tautanMasuk,
  tombolBuatAkun,
} from '../src/lib/situs'

/**
 * Isi halaman situs publik lainnya (PRD 5, PRD 11, PRD 14, dan PRD 15).
 *
 * Yang diuji: tautan hanya menuju halaman yang ada (PRD 5), modul fitur tetap
 * enam seperti B-11, Pusat Bantuan memuat panduan per modul dan masalah umum
 * (PRD 15), halaman Status tidak berisi angka ketersediaan sebelum ada data
 * pemantauan (PRD 14), kanal kontak tidak mengarang alamat (PRD 15), dan
 * dokumen kebijakan selalu menyatakan dirinya draf sebelum peninjauan hukum.
 */

const akar = fileURLToPath(new URL('..', import.meta.url))

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

describe('tautan situs publik (PRD 5)', () => {
  const semuaTautan = [
    ...tautanNavigasi,
    tautanMasuk,
    tombolBuatAkun,
    ...tautanKakiHalaman,
    ...tautanKakiKebijakan,
    kebijakanRefundTautan,
  ]

  it('menunjuk halaman yang ada', () => {
    const halaman = [...ruteHalaman()]
    for (const tautan of semuaTautan) {
      const path = tautan.href.split('?')[0]!.replace(/\/$/, '') || '/'
      expect(halaman, `tautan ${tautan.label} menunjuk halaman yang ada`).toContain(path)
    }
  })

  it('navigasi atas memuat tiga tautan PRD 11', () => {
    expect(tautanNavigasi.map((tautan) => tautan.label)).toEqual([
      'Fitur',
      'Untuk usaha F&B dan retail',
      'Harga',
    ])
  })

  it('kaki memuat dokumen PRD 11', () => {
    const label = tautanKakiKebijakan.map((tautan) => tautan.label.toLowerCase()).join(' | ')
    expect(label).toContain('privasi')
    expect(label).toContain('syarat')
    expect(label).toContain('refund')
  })
})

describe('halaman fitur (B-11 dan B-12)', () => {
  it('memuat enam modul yang ditetapkan', () => {
    expect(modulFitur.map((modul) => modul.slug)).toEqual([
      'stok',
      'pembelian',
      'penjualan',
      'pengeluaran',
      'laporan',
      'langganan',
    ])
  })

  it('setiap modul punya pengantar dan isi', () => {
    for (const modul of modulFitur) {
      expect(modul.lead.length, modul.slug).toBeGreaterThan(30)
      expect(modul.keterangan.length, modul.slug).toBeGreaterThan(10)

      // stok, pembelian, penjualan pakai daftar fungsi (B-12); sisanya
      // dijelaskan dengan paragraf panjang, kadang satu saja.
      if (['stok', 'pembelian', 'penjualan'].includes(modul.slug)) {
        expect((modul.poin ?? []).length, modul.slug).toBeGreaterThanOrEqual(5)
      } else {
        const gabungan = `${modul.lead} ${modul.paragraf ?? ''}`
        expect(gabungan.length, modul.slug).toBeGreaterThan(150)
      }
    }
  })

  it('gambar bernama modul ada dan diberi label data contoh (K-07)', () => {
    for (const modul of modulFitur) {
      if (!modul.gambar) continue
      expect(modul.gambar.alt.toLowerCase()).toContain('data contoh')
      const path = join(akar, 'public', modul.gambar.src.replace(/^\//, ''))
      expect(existsSync(path), `berkas ${modul.gambar.src} ada`).toBe(true)
    }
  })

  it('setiap slug bisa ditarik lewat modulBySlug', () => {
    for (const modul of modulFitur) {
      expect(modulBySlug(modul.slug)?.nama).toBe(modul.nama)
    }
  })
})

describe('halaman harga (PRD 16)', () => {
  it('menyebut harga masih usulan dan belum termasuk pajak', () => {
    expect(catatanHarga.join(' ')).toContain('pajak')
    expect(catatanHargaUsulan.toLowerCase()).toContain('usulan awal')
    expect(catatanUjiCoba).toContain('14 hari')
  })

  it('pertanyaan harga menyebut pembayaran yang belum aktif', () => {
    const gabungan = tanyaJawabHarga.map((item) => item.jawab).join(' ').toLowerCase()
    expect(gabungan).toContain('belum diaktifkan')
  })

  it('tautan refund menunjuk halaman draf', () => {
    expect(kebijakanRefundTautan.href).toBe('/kebijakan/refund')
  })
})

describe('pusat bantuan (PRD 15)', () => {
  it('memuat panduan per modul dan akun', () => {
    const judul = bagianBantuan.map((bagian) => bagian.judul)
    for (const wajib of ['Mulai', 'Stok', 'Pembelian', 'Penjualan', 'Pengeluaran', 'Laporan', 'Langganan', 'Akun dan keamanan']) {
      expect(judul, `bagian ${wajib}`).toContain(wajib)
    }
  })

  it('memuat penyelesaian masalah umum', () => {
    expect(masalahUmum.length).toBeGreaterThanOrEqual(5)
    const gabungan = masalahUmum.map((item) => `${item.judul} ${item.isi}`).join(' ').toLowerCase()
    // Perilaku yang menjangkau: stok negatif, batas paket, verifikasi email.
    expect(gabungan).toContain('stok negatif')
    expect(gabungan).toContain('batas paket')
    expect(gabungan).toContain('verifikasi')
  })

  it('tidak menjanjikan antrean offline yang belum ada', () => {
    const gabungan = bagianBantuan
      .flatMap((bagian) => bagian.butir.map((butir) => butir.isi))
      .concat(masalahUmum.map((item) => item.isi))
      .join(' ')
      .toLowerCase()
    expect(gabungan).toContain('antrean penyimpanan offline belum tersedia')
  })
})

describe('halaman tentang, status, dan kontak', () => {
  it('tentang menyatakan batas dengan jujur', () => {
    const gabungan = batasTentang.join(' ').toLowerCase()
    expect(gabungan).toContain('pengganti akuntansi')
    expect(gabungan).toContain('sambungan internet')
    expect(prinsipTentang).toHaveLength(3)
  })

  it('status tidak berisi angka ketersediaan (PRD 14)', () => {
    expect(leadStatus).not.toContain('99,5')
    expect(komponenStatus.length).toBeGreaterThan(0)
    for (const komponen of komponenStatus) {
      expect(komponen.keadaan.toLowerCase(), komponen.nama).toContain('belum dipantau')
    }
  })

  it('kontak tidak mengarang alamat atau nomor', () => {
    const gabungan = [leadKontak, ...saluranKontak.map((saluran) => `${saluran.judul} ${saluran.keadaan}`)].join(' ')
    expect(gabungan).not.toContain('@')
    expect(gabungan).not.toMatch(/\+62/)
  })

  it('dokumen kebijakan menyatakan dirinya draf', () => {
    expect(drafKeterangan).toContain('Draf')
    expect(drafKeterangan).toContain('belum berlaku')
    expect(isiRingkasRefund.join(' ').toLowerCase()).toContain('belum ditetapkan')
    expect(isiRingkasSyarat.join(' ').toLowerCase()).toContain('bukan pengganti akuntansi')
  })
})

describe('metadata dan kaki situs', () => {
  it('metadata menghasilkan kanonik dan openGraph', () => {
    const metadata = metadataSitus({ jalur: '/bantuan', judul: 'uji', deskripsi: 'uji tambahan' })
    expect(metadata.alternates?.canonical).toBe('/bantuan')
    expect(metadata.openGraph?.url).toBe('/bantuan')
  })

  it('kaki menyebut kewajaran draf dan halaman transparansi', () => {
    expect(catatanKaki.toLowerCase()).toContain('draf')
    expect(tagline).toBe('Catat rapi, belanja tepat.')
  })
})
