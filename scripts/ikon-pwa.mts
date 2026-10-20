/**
 * Ikon PWA (PRD 10: aplikasi dapat dipasang).
 *
 * Lambangnya sederhana: tiga batang menaik di latar warna sekunder PRD 10,
 * tanpa tulisan supaya tidak butuh berkas font. Lambang ini sementara sampai
 * merek resmi ditetapkan; penghalang itu dicatat di docs/KEPUTUSAN-TEKNIS.md.
 *
 * Berkas PNG ditulis tanpa pustaka gambar: setiap piksel dihitung, setiap baris
 * memakai penyaring nol, lalu IDAT dipadatkan dengan zlib. Ada pengesahan yang
 * membaca berkas kembali: urutan bagian, ukuran dari IHDR, dan bahwa jumlah
 * piksel terkembang pas. Berkas cacat tidak pernah masuk commit.
 */

import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const akarRepo = join(dirname(fileURLToPath(import.meta.url)), '..')
const folderKeluar = join(akarRepo, 'apps', 'web', 'public', 'ikon')

/** Token warna PRD 10: latar secondary #0B7A6B, lambang putih penuh. */
const LATA_R = 11
const LATA_G = 122
const LATA_B = 107

const tabelCrc = (() => {
  const tabel = new Uint32Array(256)
  for (let indeks = 0; indeks < 256; indeks += 1) {
    let nilai = indeks
    for (let bit = 0; bit < 8; bit += 1) {
      nilai = nilai & 1 ? 0xedb88320 ^ (nilai >>> 1) : nilai >>> 1
    }
    tabel[indeks] = nilai >>> 0
  }
  return tabel
})()

function crc32(bytes: Uint8Array): number {
  let nilai = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    nilai = tabelCrc[(nilai ^ bytes[i]!) & 0xff]! ^ (nilai >>> 8)
  }
  return (nilai ^ 0xffffffff) >>> 0
}

function chunk(tipe: string, isi: Uint8Array): Buffer {
  const bagian = Buffer.alloc(isi.length + 12)
  bagian.writeUInt32BE(isi.length, 0)
  bagian.write(tipe, 4, 'latin1')
  Buffer.from(isi).copy(bagian, 8)
  bagian.writeUInt32BE(crc32(bagian.subarray(4, 8 + isi.length)), 8 + isi.length)
  return bagian
}

type Pikselator = (x: number, y: number, lebar: number, tinggi: number) => [number, number, number, number]

function tulisPng(lebar: number, tinggi: number, piksel: Pikselator): Buffer {
  const baris = Buffer.alloc(tinggi * (lebar * 4 + 1))
  for (let y = 0; y < tinggi; y += 1) {
    const mulaiBaris = y * (lebar * 4 + 1)
    baris[mulaiBaris] = 0 // penyaring baris: None
    for (let x = 0; x < lebar; x += 1) {
      const [r, g, b, a] = piksel(x, y, lebar, tinggi)
      baris[mulaiBaris + 1 + x * 4] = r
      baris[mulaiBaris + 1 + x * 4 + 1] = g
      baris[mulaiBaris + 1 + x * 4 + 2] = b
      baris[mulaiBaris + 1 + x * 4 + 3] = a
    }
  }

  const kepala = Buffer.alloc(13)
  kepala.writeUInt32BE(lebar, 0)
  kepala.writeUInt32BE(tinggi, 4)
  kepala[8] = 8 // kedalaman bit
  kepala[9] = 6 // warna RGBA
  kepala[10] = 0 // kompresi deflate
  kepala[11] = 0 // penyaring sekali per baris
  kepala[12] = 0 // tanpa interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', kepala),
    chunk('IDAT', deflateSync(baris, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/**
 * Cek titik di dalam persegi panjang dengan sudut membulat. Di luar sudutnya
 * piksel jadi transparan, hanya untuk ikon `any`; ikon maskable selalu penuh
 * sehingga masker perangkat yang memotongnya.
 */
function dalamMembulat(x: number, y: number, lebar: number, tinggi: number, jari: number): boolean {
  const jariPiksel = Math.round(jari)
  const diKiri = x < jariPiksel
  const diKanan = x >= lebar - jariPiksel
  const diAtas = y < jariPiksel
  const diBawah = y >= tinggi - jariPiksel
  if (!(diKiri || diKanan || diAtas || diBawah)) {
    return true
  }

  const jarakX = diKiri ? jariPiksel - x : x - (lebar - 1 - jariPiksel)
  const jarakY = diAtas ? jariPiksel - y : y - (tinggi - 1 - jariPiksel)
  const sisaX = Math.max(jarakX, 0)
  const sisaY = Math.max(jarakY, 0)
  return sisaX * sisaX + sisaY * sisaY <= jariPiksel * jariPiksel
}

/**
 * Lambang tiga batang menaik: catatan stok yang tumbuh. Ikon maskable menyusut
 * isi ke zona aman supaya lambang tidak tersentuh topeng perangkat.
 */
function gambarkanLambang(lebar: number, tinggi: number, skalaIsi: number, membulat: boolean): Buffer {
  return tulisPng(lebar, tinggi, (x, y, pb, pt) => {
    if (membulat && !dalamMembulat(x, y, pb, pt, pb * 0.2)) {
      return [0, 0, 0, 0]
    }

    const bentang = pb * 0.13
    const celah = pb * 0.045
    const dasar = pt * 0.8
    const tengah = pb / 2
    const barisBatang = [pt * 0.26, pt * 0.42, pt * 0.58].map((tinggiBatang) => tinggiBatang * skalaIsi)
    const pinggirKiri = tengah - bentang - celah
    const pinggirKanan = tengah + bentang + celah

    const dalamBatang = (tengahBatang: number, tinggiYangDituju: number): boolean => {
      const mulaiX = Math.round(tengahBatang - bentang / 2)
      const akhirX = Math.round(tengahBatang + bentang / 2)
      const mulaiY = Math.round(dasar - tinggiYangDituju)
      const akhirY = Math.round(dasar)
      return x >= mulaiX && x < akhirX && y >= mulaiY && y <= akhirY
    }

    const padaLambang =
      dalamBatang(pinggirKiri, barisBatang[0]!) ||
      dalamBatang(tengah, barisBatang[1]!) ||
      dalamBatang(pinggirKanan, barisBatang[2]!)

    return padaLambang ? [255, 255, 255, 255] : [LATA_R, LATA_G, LATA_B, 255]
  })
}

/**
 * Sahkan berkas lalu izinkan masuk commit: urutan bagian dibaca ulang, ukuran
 * dari IHDR dipadankan, dan jumlah piksel terkembang harus pas.
 */
function sahkan(jalur: string, lebarYgDiuji: number, tinggiYgDiuji: number): void {
  const isi = readFileSync(jalur)
  if (isi.subarray(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') {
    throw new Error(`${jalur}: tanda PNG salah.`)
  }

  let kursor = 8
  let lebar = 0
  let tinggi = 0
  let idat: Buffer | null = null
  while (kursor < isi.length) {
    const panjang = isi.readUInt32BE(kursor)
    const tipe = isi.subarray(kursor + 4, kursor + 8).toString('latin1')
    if (tipe === 'IHDR') {
      const kepala = isi.subarray(kursor + 8, kursor + 8 + panjang)
      lebar = kepala.readUInt32BE(0)
      tinggi = kepala.readUInt32BE(4)
    } else if (tipe === 'IDAT') {
      idat = isi.subarray(kursor + 8, kursor + 8 + panjang)
    } else if (tipe === 'IEND') {
      break
    }
    // Panjang punya empat byte, tipe empat byte, isi sepanjang panjang, lalu CRC
    // empat byte.
    kursor += 12 + panjang
  }

  if (idat === null) {
    throw new Error(`${jalur}: bagian IDAT tidak ada.`)
  }
  if (lebar !== lebarYgDiuji || tinggi !== tinggiYgDiuji) {
    throw new Error(`${jalur}: ukuran ${lebar}x${tinggi}, harusnya ${lebarYgDiuji}x${tinggiYgDiuji}.`)
  }

  const pikselTerbuka = inflateSync(idat)
  const butuh = tinggiYgDiuji * (lebarYgDiuji * 4 + 1)
  if (pikselTerbuka.length !== butuh) {
    throw new Error(`${jalur}: piksel terbuka ${pikselTerbuka.length}, harusnya ${butuh}.`)
  }
}

mkdirSync(folderKeluar, { recursive: true })

const VARIAN: Array<{ nama: string; sisi: number; skala: number; membulat: boolean }> = [
  { nama: 'ikon-192.png', sisi: 192, skala: 1, membulat: true },
  { nama: 'ikon-512.png', sisi: 512, skala: 1, membulat: true },
  { nama: 'ikon-maskable-192.png', sisi: 192, skala: 0.7, membulat: false },
  { nama: 'ikon-maskable-512.png', sisi: 512, skala: 0.7, membulat: false },
  { nama: 'apple-touch-icon.png', sisi: 180, skala: 1, membulat: false },
]

for (const varian of VARIAN) {
  const jalur = join(folderKeluar, varian.nama)
  const isi = gambarkanLambang(varian.sisi, varian.sisi, varian.skala, varian.membulat)
  writeFileSync(jalur, isi)
  sahkan(jalur, varian.sisi, varian.sisi)
  console.log(`${varian.nama}: ${isi.length} byte`)
}
