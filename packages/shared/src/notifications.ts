/**
 * Jenis notifikasi PRD 6.9. Daftar ini dipakai server untuk memvalidasi dan
 * halaman pengaturan untuk menampilkan pilihan per pengguna, jadi labelnya
 * hanya ada di satu tempat.
 */

export const notificationKinds = [
  'stok_rendah',
  'po_menunggu',
  'po_disetujui',
  'po_ditolak',
  'utang_jatuh_tempo',
  'undangan',
  'keamanan',
] as const

export type NotificationKind = (typeof notificationKinds)[number]

export const notificationKindLabels: Record<NotificationKind, string> = {
  stok_rendah: 'Stok rendah',
  po_menunggu: 'PO menunggu persetujuan',
  po_disetujui: 'PO disetujui',
  po_ditolak: 'PO ditolak',
  utang_jatuh_tempo: 'Utang jatuh tempo',
  undangan: 'Undangan diterima',
  keamanan: 'Keamanan akun',
}

export const notificationKindDescriptions: Record<NotificationKind, string> = {
  stok_rendah: 'Barang turun sampai atau di bawah batas minimum yang Anda atur.',
  po_menunggu: 'Ada purchase order yang menunggu persetujuan.',
  po_disetujui: 'Purchase order yang Anda buat disetujui.',
  po_ditolak: 'Purchase order yang Anda buat ditolak beserta alasannya.',
  utang_jatuh_tempo: 'Ada utang supplier yang sudah melewati jatuh tempo.',
  undangan: 'Undangan yang Anda kirim diterima dan anggota baru bergabung.',
  keamanan: 'Kabar tentang kata sandi, email, verifikasi dua langkah, dan perangkat akun Anda.',
}

export function notificationKindLabel(kind: string): string {
  return notificationKindLabels[kind as NotificationKind] ?? kind
}
