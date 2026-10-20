import {
  catatanHarga,
  catatanHargaUsulan,
  catatanUjiCoba,
  hargaPaket,
  barisPaket,
} from './harga'
import {
  catatanKaki,
  tagline,
  tautanKakiHalaman,
  tautanKakiKebijakan,
  tautanMasuk,
  tautanNavigasi,
  tombolBuatAkun,
} from './situs'

/**
 * Isi beranda publik (PRD 11).
 *
 * Teks dan daftar ditaruh di berkas ini, bukan langsung di JSX, supaya bisa
 * diuji: tautan wajib menuju halaman yang ada (PRD 5), gambar wajib membawa
 * keterangan "data contoh" (K-07), dan harga wajib sama dengan katalog paket
 * (PRD 11 dan PRD 16).
 *
 * Yang tidak ada di sini dan tidak boleh ditambahkan tanpa bukti: testimoni,
 * jumlah pengguna, logo pelanggan, dan klaim keamanan yang belum dijalankan.
 */

export interface Tautan {
  label: string
  href: string
}

export interface Gambar {
  src: string
  alt: string
  width: number
  height: number
}

/**
 * Tombol kedua pada hero. PRD 11 mencontohkan "Lihat Demo Produk", tetapi
 * workspace contoh untuk tombol itu belum dibangun (B-13), dan PRD 5 melarang
 * memasang tautan ke halaman yang belum ada. Tombolnya sementara menunjuk
 * halaman Harga.
 */
export const tombolKedua: Tautan = { label: 'Lihat paket dan harga', href: '/harga' }

/** Semua tautan yang dipasang di beranda, dipakai tes tautan PRD 5. */
export const semuaTautan: Tautan[] = [
  ...tautanNavigasi,
  tautanMasuk,
  tombolBuatAkun,
  tombolKedua,
  ...tautanKakiHalaman,
  ...tautanKakiKebijakan,
]

export { tagline }
export { catatanUjiCoba, hargaPaket, barisPaket, catatanHarga, catatanHargaUsulan }
export { catatanKaki }

export const hero = {
  judul: 'Stok, pembelian, dan laporan usaha di satu tempat.',
  penjelasan:
    'Catat barang masuk dan keluar, buat pesanan ke supplier, dan lihat laporan bulanan tanpa rekap manual di spreadsheet.',
  catatan: catatanUjiCoba,
  gambar: {
    src: '/beranda/dashboard.png',
    alt: 'Dashboard Sahabat UMKM berisi ringkasan penjualan, utang supplier, dan stok rendah dengan data contoh.',
    width: 1200,
    height: 800,
  } satisfies Gambar,
}

export const judulMasalah = 'Catatan yang sering tertinggal'

export const leadMasalah =
  'Tiga kebiasaan yang membuat laporan akhir bulan tidak selesai, dan bagian yang mengambil alih pekerjaan itu.'

export const masalah: Array<{ kebiasaan: string; jawaban: string }> = [
  {
    kebiasaan: 'Stok dicatat di buku, koreksinya dari ingatan.',
    jawaban:
      'Setiap barang masuk dan keluar disimpan sebagai baris riwayat, dan saldo dihitung dari baris itu. Koreksi dibuat sebagai catatan baru, jadi angka lama tetap bisa ditelusuri.',
  },
  {
    kebiasaan: 'Pesanan ke supplier berjalan lewat chat.',
    jawaban:
      'Purchase order dibuat di aplikasi, diajukan untuk persetujuan, lalu dicatat saat barangnya datang. Jumlah yang diterima dan sisa utang terlihat per supplier.',
  },
  {
    kebiasaan: 'Penjualan dan pengeluaran baru direkap di akhir bulan.',
    jawaban:
      'Penjualan dicatat saat pelanggan membayar, pengeluaran dicatat saat uang keluar. Laporan periode membaca catatan itu tanpa rekap ulang.',
  },
]

export interface ModulBeranda {
  nama: string
  slug: '/fitur/stok' | '/fitur/pembelian' | '/fitur/penjualan'
  ringkas: string
  isi: string
  tautanFungsi: string
  gambar: Gambar
}

export const modul: ModulBeranda[] = [
  {
    nama: 'Stok',
    slug: '/fitur/stok',
    ringkas: 'Riwayat yang bisa ditelusuri.',
    isi: 'Setiap barang punya SKU, satuan, harga jual, dan batas stok minimum. Halaman peringatan menampilkan barang yang sudah di bawah batas, dan riwayat stok menyimpan semua pergerakan beserta alasannya.',
    tautanFungsi: 'Baca fungsi modul Stok',
    gambar: {
      src: '/beranda/stok.png',
      alt: 'Daftar barang beserta sisa stok di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    nama: 'Pembelian',
    slug: '/fitur/pembelian',
    ringkas: 'Pesanan dan utang yang tercatat.',
    isi: 'Purchase order dibuat untuk supplier, diajukan untuk persetujuan, lalu dicatat saat barangnya datang. Jumlah yang diterima dan sisa utang terlihat per supplier.',
    tautanFungsi: 'Baca fungsi modul Pembelian',
    gambar: {
      src: '/beranda/pembelian.png',
      alt: 'Daftar purchase order di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    nama: 'Penjualan',
    slug: '/fitur/penjualan',
    ringkas: 'Dicatat saat pelanggan membayar.',
    isi: 'Penjualan dicatat melalui ponsel: pilih barang, jumlah, dan metode pembayaran. Stok di lokasi tempat barang keluar langsung berkurang, dan pembatalan menyimpan alasan tanpa menghapus catatannya.',
    tautanFungsi: 'Baca fungsi modul Penjualan',
    gambar: {
      src: '/beranda/penjualan.png',
      alt: 'Daftar penjualan di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
]

export const modulLain =
  'Pengeluaran operasional dicatat per kategori dan bisa dilampiri foto atau PDF. Laporan usaha merangkum penjualan, pembelian, pengeluaran, dan pergerakan stok pada rentang tanggal yang Anda pilih, lalu bisa diekspor untuk diolah lanjut. Paket langganan mengatur batas produk aktif, anggota, dan lokasi.'

export const skenario: Array<{ usaha: string; alur: string }> = [
  {
    usaha: 'Kedai kopi',
    alur: 'Biji kopi, susu, dan kemasan dicatat sebagai barang yang masuk lewat penerimaan supplier. Penjualan dicatat per menu saat pelanggan membayar, dan barang yang tinggal sedikit muncul di halaman peringatan.',
  },
  {
    usaha: 'Warung makan',
    alur: 'Belanja bahan di pasar dicatat sebagai pengeluaran atau sebagai penerimaan barang, tergantung dari mana bahannya datang. Setelah warung tutup, penjualan hari itu dicatat, dan laporan periode menunjukkan penjualan serta pengeluaran pada rentang tanggal yang dipilih.',
  },
  {
    usaha: 'Toko retail',
    alur: 'Barang dagangan dihitung saat stok opname, dan selisihnya dicatat sebagai penyesuaian, bukan dihapus. Toko dengan lebih dari satu lokasi memisahkan stok per lokasi dan melihat pergerakan barang di tiap lokasi.',
  },
]

export const tanyaJawab: Array<{ tanya: string; jawab: string }> = [
  {
    tanya: 'Apakah data saya bisa diekspor?',
    jawab:
      'Bisa. Owner dan Admin dapat mengunduh seluruh data workspace dalam bentuk arsip berisi berkas CSV kapan saja, tanpa biaya tambahan. Paket berbayar juga bisa membuat ekspor XLSX dari laporan.',
  },
  {
    tanya: 'Bagaimana jika sinyal hilang saat mencatat?',
    jawab:
      'Aplikasi saat ini memerlukan koneksi internet untuk menyimpan catatan. Pencatatan saat sinyal hilang belum tersedia, dan sedang dikerjakan untuk rilis berikutnya.',
  },
  {
    tanya: 'Apakah ini pengganti akuntansi?',
    jawab:
      'Bukan. Aplikasi ini mencatat stok, pembelian, penjualan, dan pengeluaran harian. Tidak ada jurnal, neraca, atau perhitungan pajak, jadi pembukuan resmi tetap dikerjakan akuntan atau aplikasi akuntansi.',
  },
  {
    tanya: 'Di mana data usaha saya disimpan?',
    jawab:
      'Data disimpan di basis data layanan Sahabat UMKM dan dipisahkan per workspace. Semua permintaan diperiksa di server, sehingga pengguna di luar workspace tidak bisa membuka data Anda.',
  },
  {
    tanya: 'Bagaimana dengan keamanan dan cadangan data?',
    jawab:
      'Verifikasi dua langkah (MFA) dan pemisahan data antar workspace sudah berdiri dan bisa dipakai di semua paket. Pencadangan berkala dan uji pemulihannya belum selesai, jadi belum ada klaim yang dipasang di situs ini sampai ujinya terbukti.',
  },
]
