/**
 * Isi halaman Status Layanan (PRD 14 dan PRD 15).
 *
 * PRD 14 menetapkan: sebelum ada data pemantauan dan satu uji restore yang
 * berhasil, halaman ini menampilkan data nyata tanpa janji kontraktual. Karena
 * pemantauan otomatis belum terpasang, keadaannya ditulis apa adanya dan tidak
 * ada angka ketersediaan di halaman ini.
 */

export const leadStatus =
  'Halaman ini menampilkan keadaan layanan dengan data yang bisa dibuktikan, tanpa janji kontraktual. Target ketersediaan dan waktu pemulihan baru diumumkan setelah ada data pemantauan tiga bulan dan satu uji pemulihan cadangan yang berhasil.'

export interface KomponenLayanan {
  nama: string
  keadaan: string
}

export const komponenStatus: KomponenLayanan[] = [
  { nama: 'Aplikasi web', keadaan: 'Belum dipantau otomatis' },
  { nama: 'API pencatatan', keadaan: 'Belum dipantau otomatis' },
  { nama: 'Kirim email verifikasi dan notifikasi', keadaan: 'Belum dipantau otomatis' },
]

export const riwayatStatus =
  'Pemantauan otomatis belum terpasang, jadi halaman ini belum berisi catatan gangguan. Begitu pemantauannya berjalan, riwayat gangguan dimuat di halaman ini beserta waktunya.'

export const rencanaStatus =
  'Rencana pemantauan mencakup galat, latensi, ketersediaan, kegagalan tugas latar, dan kegagalan pembayaran, beserta pengumuman gangguan lewat email. Pemantauan dipasang per bagian layanan, dan halaman ini memperlihatkan keadannya masing-masing.'
