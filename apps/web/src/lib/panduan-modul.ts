/**
 * Panduan singkat per modul (PRD 12: tur singkat per modul saat pertama
 * dibuka, bisa ditutup dan dipanggil ulang dari menu bantuan).
 *
 * Teksnya diletakkan di pustaka supaya bisa diuji: tidak ada klaim yang
 * tidak bisa diverifikasi di kode, sapaannya memakai "Anda", dan setiap
 * tautan menunjuk halaman yang ada. Menu yang halamannya belum jadi sengaja
 * tidak mendapat entri, mengikuti aturan navigasi PRD 5.
 */

export interface PanduanModul {
  slug: string
  judul: string
  /** Halaman modul tempat panel ini muncul saat pertama kali dibuka. */
  activeHref: string
  paragraf: string[]
  tautan: Array<{ label: string; href: string }>
}

export const PANDUAN_MODUL: PanduanModul[] = [
  {
    slug: 'stok',
    judul: 'Modul Stok',
    activeHref: '/stok',
    paragraf: [
      'Stok menyimpan daftar barang, saldo per lokasi, dan seluruh riwayat perubahan. Setiap catatan masuk, keluar, atau penyesuaian menjadi baris baru yang bisa ditelusur ke saldo sebelum dan sesudahnya.',
      'Mulai dari menambah barang, lalu catat barang masuk dan keluar lewat halaman Catat stok. Peringatan stok rendah menyala bila Anda mengisi batas minimum per barang.',
    ],
    tautan: [
      { label: 'Tambah barang', href: '/stok/produk/baru' },
      { label: 'Catat stok', href: '/stok/input' },
      { label: 'Perlu perhatian', href: '/stok/peringatan' },
    ],
  },
  {
    slug: 'pembelian',
    judul: 'Modul Pembelian',
    activeHref: '/pembelian',
    paragraf: [
      'Alurnya supplier lalu purchase order, lalu penerimaan. Penerimaan barang yang dikonfirmasi barulah yang menambah saldo stok, bukan PO-nya.',
      'Utang supplier muncul dari termin syarat pembayaran, dan retur memotong nilai pembelian pada periode yang sama.',
    ],
    tautan: [
      { label: 'Supplier', href: '/pembelian/supplier' },
      { label: 'Purchase order', href: '/pembelian/po' },
      { label: 'Pembayaran', href: '/pembelian/pembayaran' },
    ],
  },
  {
    slug: 'penjualan',
    judul: 'Modul Penjualan',
    activeHref: '/penjualan',
    paragraf: [
      'Catat penjualan lewat satu formulir: pilih barang berikut jumlahnya, lalu cara bayarnya. Stok berkurang saat catatan tersimpan, dan laba kotor dihitung dari harga pokok rata-rata.',
      'Penjualan yang salah bisa dibatalkan; pembatalan mengembalikan stok sebagai baris ledger tersendiri, bukan menghapus riwayat.',
    ],
    tautan: [
      { label: 'Catat penjualan', href: '/penjualan/baru' },
      { label: 'Pelanggan', href: '/penjualan/pelanggan' },
    ],
  },
  {
    slug: 'pengeluaran',
    judul: 'Modul Pengeluaran',
    activeHref: '/pengeluaran',
    paragraf: [
      'Pengeluaran mencatat biaya operasional harian, seperti sewa dan bensin, yang perlu dirinci dari pembelian barang ke supplier.',
      'Kategori diatur tersendiri. Bila suatu kategori kelihatannya sering dipakai untuk pembelian barang, modul menandainya agar Anda bisa meninjau ulang pengelompokannya.',
    ],
    tautan: [
      { label: 'Catat pengeluaran', href: '/pengeluaran/baru' },
      { label: 'Kategori pengeluaran', href: '/pengeluaran/kategori' },
    ],
  },
  {
    slug: 'laporan',
    judul: 'Modul Laporan',
    activeHref: '/laporan',
    paragraf: [
      'Laporan membaca pembelian, penjualan, pengeluaran, dan stok dari catatan yang sama dengan halaman kerja, jadi angkanya tidak berbeda dari sumbernya.',
      'Definisi tiap metrik tertulis di laporannya. Ekspor CSV dan XLSX tersedia di Pengaturan lalu Impor dan ekspor.',
    ],
    tautan: [
      { label: 'Impor dan ekspor', href: '/pengaturan/impor-ekspor' },
      { label: 'Pusat Bantuan', href: '/bantuan' },
    ],
  },
]

export function panduanBySlug(slug: string): PanduanModul | undefined {
  return PANDUAN_MODUL.find((panduan) => panduan.slug === slug)
}

/** Panel hanya tampil untuk halaman modul yang berada di pustaka panduan. */
export function slugPanduanHalaman(activeHref: string): string | undefined {
  return PANDUAN_MODUL.find((panduan) => panduan.activeHref === activeHref)?.slug
}
