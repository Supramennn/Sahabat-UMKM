import { TRIAL_DAYS } from '@sahabat/shared'

/**
 * Isi Pusat Bantuan (PRD 15): panduan per modul dan penyelesaian masalah umum,
 * Bahasa Indonesia.
 *
 * Setiap butir menyebut perilaku yang benar-benar berdiri di aplikasi. Kalimat
 * yang menunggu fitur lain menyebut kalau itu memang belum ada.
 */

export interface ButirBantuan {
  judul: string
  isi: string
}

export interface BagianBantuan {
  judul: string
  lead?: string
  butir: ButirBantuan[]
}

export const leadBantuan =
  'Panduan singkat untuk setiap modul dan jawaban untuk kejadian yang paling sering ditanyakan. Panduan ini masih bertumbuh sejalan dengan modul yang selesai dikerjakan.'

export const bagianBantuan: BagianBantuan[] = [
  {
    judul: 'Mulai',
    lead: 'Langkah dari membuat akun sampai barang pertama tercatat.',
    butir: [
      {
        judul: 'Buat akun dan verifikasi email',
        isi: 'Daftar di halaman Buat akun gratis, lalu buka tautan verifikasi yang dikirim ke email Anda.',
      },
      {
        judul: 'Buat usaha',
        isi: 'Isi nama usaha, jenis usaha, dan zona waktu. Satu akun bisa membuka lebih dari satu usaha dan berpindah di antaranya.',
      },
      {
        judul: 'Isi barang pertama',
        isi: 'Barang bisa diisi satu per satu lewat form barang, atau diimpor lewat berkas CSV dengan template yang diunduh dari halaman impor stok.',
      },
      {
        judul: 'Isi saldo awal',
        isi: 'Saldo awal diisi lewat impor saldo awal atau input stok masuk, disertai tanggal dan alasan. Angka itu menjadi baris pertama riwayat stok.',
      },
    ],
  },
  {
    judul: 'Stok',
    butir: [
      {
        judul: 'Catat barang masuk dan keluar',
        isi: 'Input stok menerima barang masuk dan barang keluar per lokasi. Saldo dihitung dari riwayat, dan stok negatif ditolak.',
      },
      {
        judul: 'Penyesuaian',
        isi: 'Penyesuaian memperbaiki saldo tanpa barang yang bergerak, misalnya karena barang rusak atau hilang. Aksanya hanya untuk Owner dan Admin dan selalu menyimpan alasan.',
      },
      {
        judul: 'Stok opname',
        isi: 'Sesi opname membandingkan hitungan fisik dengan saldo aplikasi. Hasilnya perlu persetujuan Owner atau Admin sebelum mengubah saldo.',
      },
      {
        judul: 'Perlu perhatian',
        isi: 'Halaman ini menampung barang dengan saldo di bawah batas minimum, supaya pesanan ke supplier bisa disiapkan sebelum barang habis.',
      },
    ],
  },
  {
    judul: 'Pembelian',
    butir: [
      {
        judul: 'Supplier dan syarat pembayaran',
        isi: 'Simpan supplier dengan kontak dan syarat pembayaran dalam hari, supaya jatuh tempo dihitung dari tanggal penerimaan.',
      },
      {
        judul: 'Purchase order dan persetujuan',
        isi: 'PO dibuat sebagai rancangan, diajukan, lalu disetujui sesuai aturan workspace. Paket Bisnis menambahkan persetujuan berjenjang dengan ambang nominal.',
      },
      {
        judul: 'Penerimaan',
        isi: 'Barang yang datang dicatat pada penerimaan, bisa sebagian. Stok bertambah saat penerimaan dicatat, bukan saat PO disetujui.',
      },
      {
        judul: 'Retur dan pembayaran',
        isi: 'Retur mengurangi stok dan utang. Pembayaran supplier melunasi sebagian atau seluruh utang, dengan metode dan referensi yang ikut tersimpan.',
      },
      {
        judul: 'Tautan untuk supplier',
        isi: 'Detail PO bisa dibagikan sebagai tautan baca-saja yang punya masa berlaku dan tidak perlu masuk ke aplikasi.',
      },
    ],
  },
  {
    judul: 'Penjualan',
    butir: [
      {
        judul: 'Catat penjualan',
        isi: 'Pilih barang, isi jumlah, pilih metode pembayaran, dan simpan. Stok lokasi tempat barang keluar langsung berkurang pada catatan yang sama.',
      },
      {
        judul: 'Batalkan dengan alasan',
        isi: 'Penjualan yang salah dibatalkan dengan menyebut alasan. Catatannya tetap ada; yang berubah hanya saldonya.',
      },
      {
        judul: 'Pelanggan',
        isi: 'Pelanggan disimpan opsional agar riwayat penjualan per pelanggan bisa dibaca.',
      },
      {
        judul: 'Impor penjualan',
        isi: 'Penjualan selama satu periode bisa diimpor lewat CSV dengan template dari aplikasi, dan hasil impor bisa dibatalkan selama belum ada yang menghitung barisnya.',
      },
    ],
  },
  {
    judul: 'Pengeluaran',
    butir: [
      {
        judul: 'Catat pengeluaran',
        isi: 'Isi nominal, kategori, tanggal, dan keterangan. Kategori disusun sendiri di halaman kategori pengeluaran.',
      },
      {
        judul: 'Lampiri bukti',
        isi: 'Foto nota atau berkas PDF bisa dilampiri ke catatan pengeluaran dan dibuka kembali dari detailnya.',
      },
    ],
  },
  {
    judul: 'Laporan',
    butir: [
      {
        judul: 'Pilih rentang',
        isi: 'Laporan membaca hari, minggu, atau rentang tanggal yang Anda pilih. Setiap angka bisa dilacak sampai transaksi asalnya.',
      },
      {
        judul: 'Ekspor',
        isi: 'Laporan diekspor ke CSV, dan paket berbayar menambahkan XLSX. Ekspor seluruh data workspace juga tersedia bagi Owner dan Admin di semua paket.',
      },
      {
        judul: 'Batas laporan',
        isi: 'Laporan menampilkan laba kotor dari catatan harian dan tidak menampilkan laba bersih, karena pembukuan resmi tetap perlu akuntan atau aplikasi akuntansi.',
      },
    ],
  },
  {
    judul: 'Langganan',
    butir: [
      {
        judul: 'Batas paket',
        isi: 'Batas produk aktif, anggota, dan lokasi dicek di server. Ketika tercapai, fiturnya jadi baca saja dan pesannya menyebut cara menaikkan paket.',
      },
      {
        judul: `Uji coba ${TRIAL_DAYS} hari`,
        isi: 'Uji coba menyala satu kali per workspace dan berakhir otomatis ke paket Gratis tanpa menghapus data.',
      },
    ],
  },
  {
    judul: 'Akun dan keamanan',
    butir: [
      {
        judul: 'Kata sandi',
        isi: 'Kata sandi diganti di Pengaturan akun. Kalau lupa, gunakan halaman atur ulang kata sandi dari email.',
      },
      {
        judul: 'Verifikasi dua langkah (MFA)',
        isi: 'Verifikasi dua langkah diaktifkan di Pengaturan akun, dan kode pemulihan sekali pakai tersedia saat mengaktifkannya, jadi akun tidak terkunci jika perangkat pembuatan kode hilang.',
      },
      {
        judul: 'Perangkat dan sesi',
        isi: 'Daftar perangkat tempat Anda masuk terlihat di Pengaturan akun, beserta tombol untuk keluarkan akun dari semua perangkat.',
      },
      {
        judul: 'Peran anggota',
        isi: 'Anggota undangan diberi peran Owner, Admin, Purchasing, Staf, atau Viewer. Izinnya dicek kembali di server untuk setiap permintaan.',
      },
    ],
  },
]

/** Kejadian yang paling sering membuat pemilik usaha terhenti. */
export const masalahUmum: ButirBantuan[] = [
  {
    judul: 'Stok tidak bisa dikurangi',
    isi: 'Stok negatif ditolak. Periksa saldo dan pilih lokasi yang benar. Kalau angka lama ternyata salah, catat stok masuk atau keluar yang benar, atau buat penyesuaian sebagai catatan baru yang disetujui.',
  },
  {
    judul: 'Fitur tiba-tiba jadi baca saja',
    isi: 'Itu penanda batas paket, bukan kerusakan. Pesan yang muncul menyebut batas mana yang tercapai dan cara menaikkan paket. Data tidak hilang dan fitur kembali aktif setelah batasnya naik.',
  },
  {
    judul: 'Email verifikasi tidak datang',
    isi: 'Tunggu beberapa menit, lalu minta tautan baru di halaman verifikasi email. Permintaan baru bisa dibuat setelah jeda sepuluh menit, dan pastikan alamat email yang didaftarkan benar.',
  },
  {
    judul: 'Lupa kata sandi',
    isi: 'Buka halaman Lupa kata sandi dan masukkan email Anda. Tautan atur ulang dikirim ke email itu dan berlaku terbatas.',
  },
  {
    judul: 'Sinyal hilang saat mencatat',
    isi: 'Halaman yang sudah pernah dibuka tetap bisa dibuka tanpa sinyal. Catatan stok yang dibuat saat offline masuk antrean dengan status yang terlihat dan baru mengubah saldo setelah server mengonfirmasi saat koneksi kembali. Mencatat penjualan, pembelian, dan pengeluaran masih membutuhkan sambungan internet.',
  },
  {
    judul: 'Saldo tidak sama dengan hitungan fisik',
    isi: 'Hitung ulang dengan sesi stok opname, kirim hasilnya untuk persetujuan, dan selisihnya akan tercatat sebagai baris baru beserta alasannya.',
  },
]
