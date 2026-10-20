import { TRIAL_DAYS } from '@sahabat/shared'

/**
 * Isi halaman dokumen kebijakan (PRD 15).
 *
 * PRD 15 menilai dokumen hukum harus ditinjau penasihat hukum sebelum rilis,
 * dan penghalang rilisnya masih "belum". Karena itu keempat dokumen ini
 * dipasang sebagai draf yang menyatakan statusnya, dengan isi yang menuliskan
 * hanya perilaku yang sudah berdiri di kode. Isinya akan diganti setelah
 * peninjauan selesai.
 */

export const drafKeterangan = 'Draf. Menunggu peninjauan penasihat hukum, dan belum berlaku sampai ditinjau selesai.'

export const emailKerjaTidakTersedia =
  'Kanal permintaan (email atau formulir) akan dituliskan setelah penanggung jawab dukungan ditunjuk.'

/** Ada di Kebijakan Privasi dan Syarat: retensi riwayat audit per paket. */
export const retensiAudit =
  'Riwayat audit mengikuti batas retensi paket: 30 hari di paket Gratis, 90 hari di paket Usaha, dan 12 bulan di paket Bisnis.'

interface IsiPrivasi {
  bagian: string
  daftar: string[]
}

export const privasi: IsiPrivasi[] = [
  {
    bagian: 'Data yang diproses',
    daftar: [
      'Data akun: nama lengkap, alamat email, kata sandi yang disimpan sebagai hash. Kata sandi polos tidak pernah disimpan.',
      'Data usaha: produk, kategori, lokasi, riwayat stok, supplier, purchase order, penerimaan, retur, pembayaran supplier, pelanggan, penjualan, pengeluaran, dan lampiran foto atau PDF.',
      'Data keamanan: kode verifikasi dua langkah (MFA) disimpan dalam bentuk terenkripsi, beserta catatan perangkat dan sesi aktif.',
      'Data teknis: catatan audit untuk aksi yang dilakukan, beserta nomor IP pada peristiwa keamanan tertentu seperti percobaan masuk dan penggantian kata sandi.',
    ],
  },
  {
    bagian: 'Inilah tempat datanya berada',
    daftar: [
      'Data usaha disimpan di basis data layanan dan dipisah per workspace dengan batasan itu di level basis data, bukan hanya di layar.',
      'Foto barang dan lampiran pengeluaran disimpan di penyimpanan objek terpisah dari basis data.',
      'Email verifikasi dan notifikasi dikirim lewat penyedia email yang dipakai layanan.',
    ],
  },
  {
    bagian: 'Siapa yang melihat data usaha',
    daftar: [
      'Anggota workspace memakai peran Owner, Admin, Purchasing, Staf, atau Viewer, dan izinnya diperiksa di server untuk setiap permintaan.',
      'Orang di luar workspace tidak bisa membuka datanya, termasuk lewat tautan, karena setiap tautan baca-saja punya masa berlaku dan tidak menyertakan sesi.',
      'Antara workspace tidak ada permintaan data yang bisa melewati batas tersebut.',
    ],
  },
  {
    bagian: 'Berapa lama data disimpan',
    daftar: [
      retensiAudit,
      'Penghapusan workspace oleh Owner berjalan dengan konfirmasi berlapis dan masa tenggang 30 hari, dan data bisa diekspor dulu sebelum penghapusan permanen.',
      'Riwayat tagihan langganan disimpan sebagaimana kebutuhan akuntansi tagihan itu sendiri.',
    ],
  },
  {
    bagian: 'Hak Anda',
    daftar: [
      'Mengunduh seluruh data workspace dalam bentuk arsip berisi berkas CSV kapan saja, dari aplikasi.',
      'Meminta hentikan pengiriman email per jenisnya lewat pengaturan notifikasi di aplikasi.',
      `Meminta penghapusan data. Untuk permintaan penghapusan di luar alur penghapusan workspace sendiri, kanal permintaannya akan dituliskan setelah penanggung jawab dukungan ditunjuk.`,
    ],
  },
]

export const isiRingkasRefund: string[] = [
  'Kebijakan refund lengkap belum ditetapkan, karena dokumen ini menunggu peninjauan penasihat hukum.',
  'Saat ini penagihan langganan belum diaktifkan, sehingga belum ada tagihan yang muncul dan belum ada dana yang terkumpul untuk dikembalikan.',
  'Ketika penagihan sudah aktif, ketentuan pengembalian dana untuk pembayaran bulanan dan tahunan akan tertulis di halaman ini, dan halaman ini ditautkan dari halaman Harga serta dari halaman pembayaran di aplikasi sebelum Anda membayar.',
]

export const isiRingkasSyarat: string[] = [
  `Layanan ini mencatat stok, pembelian, penjualan, dan pengeluaran usaha, serta menyusun laporan dari catatan itu. Layanan ini bukan pengganti akuntansi: tidak ada jurnal, neraca, atau perhitungan pajak, dan laporan tidak menampilkan laba bersih.`,
  'Satu akun dapat menjadi anggota lebih dari satu workspace. Setiap workspace memiliki pengaturan izinnya sendiri, dan pemiliknya (Owner) bertanggung jawab atas peran yang diberikan kepada anggotanya.',
  'Perubahan stok adalah catatan yang tidak bisa diubah atau dihapus. Koreksi selalu dibuat sebagai catatan baru, termasuk hasil stok opname dan penyesuaian yang menunggu persetujuan.',
  'Stok negatif ditolak. Transaksi yang dibatalkan tidak menghapus catatannya, dan kegagalan transaksi tidak mengubah saldo.',
  `Uji coba ${TRIAL_DAYS} hari menyala satu kali untuk setiap workspace dan berakhir otomatis ke paket Gratis tanpa menghapus data.`,
  'Batas paket (produk aktif, anggota, dan lokasi) diberlakukan di server. Ketika batas tercapai, fitur terkait menjadi baca saja dan pesannya menyebut cara menaikkan paket.',
  'Kata sandi dan perangkat akses menjaga akun Anda. Verifikasi dua langkah disediakan sebagai lapisan tambahan, lengkap dengan kode pemulihan sekali pakai dan tombol mengeluarkan akun dari semua perangkat.',
  'Butir di atas ditulis dari perilaku yang sudah berdiri di kode dan menunggu peninjauan penasihat hukum sebelum berlaku sebagai perjanjian.',
]
