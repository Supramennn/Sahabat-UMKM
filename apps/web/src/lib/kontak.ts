/**
 * Isi halaman Kontak (PRD 15).
 *
 * PRD 15 menetapkan: jam layanan dan target waktu respons ditulis di halaman
 * ini setelah tim dukungan ditetapkan, bukan sebelumnya. Badan usaha penjual
 * juga belum ditetapkan, jadi halaman ini menyatakan keadaannya tanpa
 * mengarang alamat, nomor, atau alamat email.
 */

export const leadKontak =
  'Kanal dukungan yang dipakai hari ini adalah Pusat Bantuan: panduan per modul dan penyelesaian masalah umum, ditulis dalam Bahasa Indonesia.'

export const saluranKontak: Array<{ judul: string; keadaan: string; tautan?: string }> = [
  {
    judul: 'Pusat Bantuan',
    keadaan: 'Tersedia sekarang',
    tautan: '/bantuan',
  },
  {
    judul: 'Email dan formulir dukungan di dalam aplikasi',
    keadaan: 'Disiapkan, alamatnya belum ditetapkan',
  },
  {
    judul: 'WhatsApp untuk paket berbayar',
    keadaan: 'Disiapkan, nomornya belum ditetapkan',
  },
]

export const penutupKontak =
  'Panduan untuk saluran email, formulir di dalam aplikasi, dan WhatsApp beserta jam layanannya ditambahkan ke halaman ini setelah penanggung jawab dukungannya ditunjuk, sehingga tidak ada saluran yang dipasang tanpa siapa pun yang menjaganya.'
