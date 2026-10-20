import { formatNumber, formatRupiah, planCatalog, planCodes, planPrice, TRIAL_DAYS, YEARLY_MONTHS } from '@sahabat/shared'
import type { PlanCode } from '@sahabat/shared'

/**
 * Isi halaman Harga dan tabel paket yang dipakai bersama beranda (PRD 11.6:
 * harga di beranda sama dengan halaman Harga).
 *
 * Semua nominal dibaca dari katalog `@sahabat/shared`, katalog yang sama
 * dengan halaman paket di aplikasi, supaya angkanya tidak bisa meleset dari
 * aplikasi.
 */

export const catatanUjiCoba = `Uji coba ${TRIAL_DAYS} hari tersedia satu kali untuk setiap workspace, tanpa kartu pembayaran.`

/** Harga satu paket, dibaca dari katalog bersama supaya sama dengan aplikasi. */
export function hargaPaket(code: PlanCode): { utama: string; keterangan: string | null } {
  const bulanan = planPrice(code, 'bulanan')
  if (bulanan === 0) {
    return { utama: 'Gratis', keterangan: null }
  }
  return {
    utama: `${formatRupiah(bulanan)} / bulan`,
    keterangan: `${formatRupiah(planPrice(code, 'tahunan'))} / tahun, setara ${YEARLY_MONTHS} bulan`,
  }
}

export interface BarisPaket {
  label: string
  nilai: Record<PlanCode, string>
}

/** Baris perbandingan paket, sejajar dengan tabel PRD 16. */
export function barisPaket(): BarisPaket[] {
  const untukSemua = (ambil: (plan: (typeof planCatalog)[PlanCode]) => string): Record<PlanCode, string> =>
    Object.fromEntries(planCodes.map((code) => [code, ambil(planCatalog[code])])) as Record<PlanCode, string>

  const yaTidak = (nilai: boolean) => (nilai ? 'Ya' : 'Tidak')

  return [
    { label: 'Produk aktif', nilai: untukSemua((plan) => formatNumber(plan.activeProducts)) },
    { label: 'Anggota termasuk undangan', nilai: untukSemua((plan) => formatNumber(plan.members)) },
    { label: 'Lokasi', nilai: untukSemua((plan) => formatNumber(plan.locations)) },
    { label: 'Purchase order dan penerimaan', nilai: untukSemua(() => 'Ya') },
    { label: 'Penjualan sederhana', nilai: untukSemua((plan) => yaTidak(plan.sales)) },
    { label: 'Retur dan utang supplier', nilai: untukSemua((plan) => yaTidak(plan.returns)) },
    { label: 'Stok opname', nilai: untukSemua((plan) => yaTidak(plan.stocktake)) },
    { label: 'Ekspor', nilai: untukSemua((plan) => (plan.xlsxExport ? 'CSV dan XLSX' : 'CSV')) },
    { label: 'Approval PO berjenjang', nilai: untukSemua((plan) => yaTidak(plan.multilevelApproval)) },
    {
      label: 'Riwayat audit',
      nilai: untukSemua((plan) => (plan.auditLogDays >= 365 ? '12 bulan' : `${plan.auditLogDays} hari`)),
    },
  ]
}

export const catatanHarga: string[] = [
  `Pembayaran tahunan setara ${YEARLY_MONTHS} bulan.`,
  'Harga belum termasuk pajak yang berlaku.',
  'MFA, pemisahan data antar workspace, dan ekspor seluruh data tersedia di semua paket.',
]

/**
 * PRD 16 menyebut harga ini usulan awal yang diuji kesediaan membayarnya
 * sebelum rilis. Kalimat ini memasang batasnya supaya pengunjung tidak
 * menganggap angkanya final.
 */
export const catatanHargaUsulan =
  'Angka harga di atas masih usulan awal dan bisa berubah setelah pengujian kesediaan membayar selesai.'

export const kebijakanRefundTautan = { label: 'Kebijakan Refund (draf)', href: '/kebijakan/refund' }

/** Pertanyaan umum yang khusus tentang harga, bukan salinan FAQ beranda. */
export const tanyaJawabHarga: Array<{ tanya: string; jawab: string }> = [
  {
    tanya: 'Bagaimana cara mencobanya sebelum membayar?',
    jawab: `Setiap workspace dapat uji coba ${TRIAL_DAYS} hari di paket Usaha, satu kali, tanpa kartu pembayaran. Setelah masa uji coba habis, workspace turun ke paket Gratis dan data usaha tetap ada.`,
  },
  {
    tanya: 'Apakah saya bisa membayar sekarang?',
    jawab:
      'Pembayaran di dalam aplikasi belum diaktifkan sampai identitas penjual dan tautan kebijakan refund selesai dipasang. Selama itu belum menyala, paket berbayar diuji lewat masa uji coba dan tidak ada tagihan yang muncul.',
  },
  {
    tanya: 'Apa yang terjadi jika saya melewati batas paket?',
    jawab:
      'Batas dicek di server. Fitur yang kena batas menjadi baca saja dan pesan yang muncul menyebut batasnya beserta cara menaikkan paket. Data usaha tidak dihapus ketika batas tercapai atau paket turun ke Gratis.',
  },
  {
    tanya: 'Apakah paket Gratis benar-benar tanpa batas waktu?',
    jawab:
      'Ya. Paket Gratis tidak berbatas waktu dan tetap memakai MFA serta ekspor seluruh data di dalamnya, sama seperti paket berbayar.',
  },
]
