/**
 * Isi halaman Tentang (PRD 5).
 *
 * Halaman ini menjelaskan apa produknya dan prinsip kerja yang benar-benar
 * diberlakukan di kodenya. Tidak ada sejarah, pendiri, atau badan usaha,
 * karena belum ada satu pun yang bisa disebut.
 */

export const leadTentang =
  'Sahabat UMKM adalah aplikasi web untuk mencatat stok, pembelian ke supplier, penjualan, dan pengeluaran operasional, serta membaca laporan usaha kecil. Aplikasinya sederhana secara sengaja: catatan yang bisa dipercaya lebih penting daripada deret fitur.'

export interface Prinsip {
  judul: string
  isi: string
}

export const prinsipTentang: Prinsip[] = [
  {
    judul: 'Riwayat tidak bisa diubah',
    isi: 'Setiap perubahan stok adalah baris riwayat yang tidak bisa diedit atau dihapus. Koreksi dibuat sebagai baris baru, jadi angka hari ini tetap bisa dijelaskan dengan cara yang sama di tahun depan.',
  },
  {
    judul: 'Data usaha terpisah dan dijaga di server',
    isi: 'Data disimpan per workspace, dan setiap permintaan API diperiksa izinnya di server sebelum data dikirim. Menyembunyikan tombol di layar bukan pengaturan keamanannya.',
  },
  {
    judul: 'Klaim hanya yang bisa dibuktikan',
    isi: 'Halaman-halaman di situs ini hanya menyatakan fitur yang sudah berdiri di kode. Ketika sesuatu belum ada, keadaannya ditulis apa adanya.',
  },
]

export const batasTentang: string[] = [
  'Aplikasi ini bukan pengganti akuntansi. Tidak ada jurnal, neraca, atau perhitungan pajak, dan laporan tidak menampilkan laba bersih.',
  'Catatan stok bisa dibuat saat sinyal hilang dan masuk antrean dengan status yang terlihat, tetapi bagian lain seperti penjualan, pembelian, dan pengeluaran masih membutuhkan sambungan internet.',
  'Workspace contoh untuk mencoba produk tanpa mendaftar belum tersedia. Untuk sekarang, cara mencobanya adalah membuat akun gratis dan mengisi data sendiri.',
]
