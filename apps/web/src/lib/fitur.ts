import type { Gambar } from './beranda'

/**
 * Isi halaman Fitur: satu halaman per modul (PRD 5 dan PRD 11), daftar modulnya
 * tetap sebagaimana B-11 dan B-12 di docs/KEPUTUSAN-TEKNIS.md.
 *
 * Yang dinyatakan di sini hanya perilaku yang benar-benar berdiri di kode.
 * Modul Stok, Pembelian, dan Penjualan punya daftar fungsi karena keduanya
 * dipakai staf dan pemilik setiap hari; Pengeluaran, Laporan, dan Langganan
 * dijelaskan satu paragraf sesuai B-12.
 */

export type SlugFitur = 'stok' | 'pembelian' | 'penjualan' | 'pengeluaran' | 'laporan' | 'langganan'

export interface ModulFitur {
  slug: SlugFitur
  nama: string
  keterangan: string
  lead: string
  /** Daftar fungsi dipakai Stok, Pembelian, dan Penjualan. */
  poin?: string[]
  /** Paragraf utama dipakai Pengeluaran, Laporan, dan Langganan (B-12). */
  paragraf?: string
  gambar?: Gambar
}

export const leadFitur =
  'Alat mencatat yang memisahkan tugas per modul. Setiap modul punya satu halaman di sini; panduan pemakaiannya ada di Pusat Bantuan.'

export const modulFitur: ModulFitur[] = [
  {
    slug: 'stok',
    nama: 'Stok',
    keterangan: 'Riwayat barang masuk dan keluar yang bisa ditelusuri.',
    lead: 'Saldo dihitung dari riwayat, bukan ditulis ulang. Koreksi dibuat sebagai catatan baru, jadi angka lama tetap terbaca.',
    poin: [
      'Setiap barang punya kode SKU, nama, satuan, harga jual, harga beli acuan, dan batas stok minimum.',
      'Barang masuk, barang keluar, penyesuaian, dan hasil stok opname tersimpan di satu riwayat yang tidak bisa diubah, dan saldo dihitung dari baris riwayat itu.',
      'Kategori dan lokasi memisahkan barang; stok dihitung per lokasi.',
      'Penyesuaian dan persetujuan hasil opname hanya untuk Owner dan Admin, dan kedua aksi itu selalu menyimpan alasan.',
      'Halaman perlu perhatian menampilkan barang yang sudah di bawah batas minimum.',
      'Barang baru dan saldo awal bisa diimpor lewat berkas CSV dengan template yang diunduh dari aplikasi.',
    ],
    gambar: {
      src: '/beranda/stok.png',
      alt: 'Daftar barang beserta sisa stok di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    slug: 'pembelian',
    nama: 'Pembelian',
    keterangan: 'Pesanan ke supplier sampai barangnya masuk stok.',
    lead: 'Pesanan, persetujuan, penerimaan, retur, dan utang supplier berjalan di satu jalur, jadi sisa yang belum dibayar selalu ada angkanya.',
    poin: [
      'Supplier disimpan bersama nama kontak dan syarat pembayarannya dalam hari, jadi jatuh tempo utang dihitung dari tanggal penerimaan.',
      'Purchase order diajukan untuk persetujuan sesuai aturan workspace; paket Bisnis menambahkan persetujuan berjenjang dengan ambang nominal.',
      'Penerimaan bisa dilakukan sebagian, dan stok bertambah pada saat penerimaan dicatat, bukan saat pesanan disetujui.',
      'Retur pembelian mengurangi stok dan mengurangi utang atau menambah pembelian baru.',
      'Pembayaran supplier dicatat terhadap utang yang ada, dengan metode dan referensi yang ikut tersimpan.',
      'Purchase order bisa dibagikan ke supplier lewat tautan baca-saja yang punya masa berlaku dan tidak memuat sesi apa pun.',
    ],
    gambar: {
      src: '/beranda/pembelian.png',
      alt: 'Daftar purchase order di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    slug: 'penjualan',
    nama: 'Penjualan',
    keterangan: 'Dicatat saat pelanggan membayar, stok langsung berkurang.',
    lead: 'Satu catatan penjualan mengurangi stok dan menyimpan angka yang dibaca laporan, tanpa rekap ulang di akhir bulan.',
    poin: [
      'Penjualan dicatat dari daftar barang: pilih barang, isi jumlah, pilih metode pembayaran yang dipakai.',
      'Stok di lokasi tempat barang keluar langsung berkurang pada catatan yang sama.',
      'Harga jual dan harga pokok disimpan per baris penjualan, jadi laporan laba bulan berjalan tidak berubah karena pembelian baru.',
      'Pembatalan menyimpan alasannya dan tidak menghapus catatannya.',
      'Pelanggan bisa disimpan agar riwayat per pelanggan terlihat.',
      'Penjualan bisa diimpor lewat berkas CSV dengan template dari aplikasi.',
    ],
    gambar: {
      src: '/beranda/penjualan.png',
      alt: 'Daftar penjualan di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    slug: 'pengeluaran',
    nama: 'Pengeluaran',
    keterangan: 'Uang keluar dicatat saat terjadi, lengkap dengan buktinya.',
    lead: 'Pengeluaran operasional dicatat saat uang keluar: nominal, kategori, tanggal, dan keterangan. Kategori bisa diatur sendiri, dan satu pengeluaran bisa dilampiri foto nota atau berkas PDF supaya buktinya tetap menyatu dengan catatannya. Pengeluaran terakhir muncul di laporan periode tanpa direkap ulang.',
    gambar: {
      src: '/beranda/pengeluaran.png',
      alt: 'Daftar pengeluaran per kategori di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    slug: 'laporan',
    nama: 'Laporan dan dashboard',
    keterangan: 'Ringkasan usaha dari catatan yang sudah ada.',
    lead: 'Laporan usaha merangkum penjualan, laba, pembelian, pengeluaran, dan pergerakan stok pada rentang tanggal yang Anda pilih. Laporan bisa diekspor ke CSV, dan paket berbayar memakai XLSX. Laporan tidak menampilkan laba bersih, karena pembukuan resmi tetap dikerjakan akuntan atau aplikasi akuntansi.',
    paragraf:
      'Halaman dashboard menampilkan ringkasan yang sama pada rentang yang sering dilihat: penjualan, utang jatuh tempo, barang dengan stok rendah, dan purchase order yang belum selesai, beserta pengeluaran hari itu.',
    gambar: {
      src: '/beranda/laporan.png',
      alt: 'Laporan usaha harian di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    slug: 'langganan',
    nama: 'Langganan',
    keterangan: 'Batas paket yang jelas, tanpa data yang hilang.',
    lead: 'Setiap batas paket dicek di server. Ketika batas tercapai, fiturnya menjadi baca saja dan pesan yang muncul menyebut batasnya beserta cara menaikkan paket, bukan berhenti diam-diam. Data usaha tidak pernah dihapus ketika batas tercapai atau paket turun ke Gratis; yang terkunci adalah tulisan baru.',
    paragraf:
      'Halaman paket di aplikasi menampilkan harga yang sama dengan halaman Harga di situs ini, masa uji coba yang menyala satu kali, dan riwayat pembayaran serta faktur saat penagihannya sudah aktif.',
    gambar: {
      src: '/beranda/langganan.png',
      alt: 'Halaman paket dan langganan di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
]

export function modulBySlug(slug: string): ModulFitur | undefined {
  return modulFitur.find((modul) => modul.slug === slug)
}
