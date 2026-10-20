import type { Gambar } from './beranda'

/**
 * Isi halaman "Untuk usaha F&B dan retail" (PRD 5 dan PRD 11).
 *
 * Semua teksnya skenario pemakaian, bukan testimoni, dan setiap kalimat
 * menyebut perilaku yang benar-benar ada di aplikasi.
 */

export interface SkenarioUsaha {
  nama: string
  lead: string
  butir: string[]
}

export const leadUntukUsaha =
  'Halaman ini menunjukkan bagaimana alur kerja harian F&B dan retail memetakan diri ke modul Sahabat UMKM. Tulisannya adalah skenario pemakaian, bukan testimoni, karena belum ada pengguna yang diperbolehkan dikutip.'

export interface BagianUsaha {
  kelompok: string
  lead: string
  skenario: SkenarioUsaha[]
  gambar: Gambar
}

export const bagianUsaha: BagianUsaha[] = [
  {
    kelompok: 'Usaha F&B',
    lead: 'Kedai kopi, warung makan, dan usaha yang menjual menu. Bahan baku masuk dari supplier atau pasar, lalu keluar saat menu terjual.',
    skenario: [
      {
        nama: 'Kedai kopi',
        lead: 'Biji kopi, susu, dan kemasan dihitung sebagai barang. Belanja mingguan dijalankan lewat purchase order, bukan lewat chat.',
        butir: [
          'Biji kopi, susu, dan cup masuk stok saat penerimaan supplier dicatat, dan saldo langsung bertambah.',
          'Penjualan per menu dicatat saat pelanggan membayar, berhubungan langsung dengan bahan yang tercatat di stok.',
          'Barang yang tinggal sedikit muncul di halaman perlu perhatian, jadi belanja berikutnya tidak menunggu kehabisan baru disadari.',
        ],
      },
      {
        nama: 'Warung makan',
        lead: 'Belanja bahan datang dari dua jalur, dan keduanya punya tempatnya sendiri di aplikasi.',
        butir: [
          'Belanja bahan dari pasar dicatat sebagai pengeluaran dengan foto nota dilampiri.',
          'Belanja dari supplier yang ditunggu tagihannya dicatat sebagai penerimaan barang, sehingga utangnya terpisah dari pengeluaran tunai.',
          'Setelah warung tutup, penjualan hari itu dicatat sekali, dan laporan periode menampilkan penjualan serta pengeluaran pada rentang tanggal yang dipilih.',
        ],
      },
    ],
    gambar: {
      src: '/beranda/penjualan.png',
      alt: 'Daftar penjualan di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
  {
    kelompok: 'Usaha retail',
    lead: 'Toko barang jadi, sering dengan lebih dari satu lokasi dan kewajiban hitung fisik secara berkala.',
    skenario: [
      {
        nama: 'Toko dengan stok opname',
        lead: 'Barang dagangan dihitung secara fisik, dan selisihnya dicatat sebagai penyesuaian, bukan dihapus.',
        butir: [
          'Hasil opname dibuat sebagai sesi, dan penyetujuannya dilakukan Owner atau Admin dengan alasan yang tersimpan.',
          'Selisih antara hitungan fisik dan saldo aplikasi dibuat sebagai catatan baru, jadi riwayatnya tetap bisa ditelusuri.',
          'Riwayat stok menampilkan siapa yang mencatat apa, karena setiap baris membawa pelakunya.',
        ],
      },
      {
        nama: 'Toko dengan lebih dari satu lokasi',
        lead: 'Gudang dan gerai terpisah, dan stoknya dihitung terpisah.',
        butir: [
          'Setiap lokasi punya saldo dan riwayat sendiri, sehingga barang yang sama tidak bercampur antarlokasi.',
          'Penjualan dicatat dari lokasi tempat barang keluar.',
          'Laporan per lokasi menampilkan penjualan dan pergerakan barangnya masing-masing.',
        ],
      },
    ],
    gambar: {
      src: '/beranda/stok.png',
      alt: 'Daftar barang beserta sisa stok di aplikasi Sahabat UMKM dengan data contoh.',
      width: 1200,
      height: 800,
    },
  },
]

export const penutupUntukUsaha =
  'Skenario di atas ditulis dari kerja harian yang umum di setiap jenis usaha, bukan dari pengguna nyata. Langsung mencoba di workspace sendiri tetap cara paling jujur untuk menilai kecocokannya.'
