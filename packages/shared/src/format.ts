/**
 * Format tampilan dari PRD 10: Rp1.250.000 dan 9 Okt 2026.
 *
 * Implementasi manual, bukan Intl, karena hasil Intl untuk Indonesian rupiah
 * memakai spasi setelah "Rp" dan berbeda antar versi ICU. PRD menetapkan
 * bentuknya tanpa spasi, jadi bentuk itu dikunci di sini dan diuji.
 */

const monthShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Uang disimpan sebagai rupiah penuh tanpa pecahan (KEPUTUSAN-TEKNIS bagian 3),
 * jadi pemformat tidak pernah membuat angka desimal.
 */
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Nominal tidak valid: ${amount}`)
  }
  const negative = amount < 0
  const digits = Math.abs(Math.trunc(amount)).toString()
  return `${negative ? '-' : ''}Rp${groupThousands(digits)}`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Angka tidak valid: ${value}`)
  }
  const negative = value < 0
  const digits = Math.abs(Math.trunc(value)).toString()
  return `${negative ? '-' : ''}${groupThousands(digits)}`
}

export interface DateParts {
  year: number
  month: number
  day: number
}

/**
 * Tanggal ditafsirkan sebagai tanggal kalender workspace, bukan momen absolut.
 * Parts dibangun di zona waktu workspace supaya "hari" pada laporan sama dengan
 * hari yang dilihat pengguna (PRD 6.1, KEPUTUSAN-TEKNIS B-10).
 */
export function formatDate(parts: DateParts): string {
  const month = monthShort[parts.month - 1]
  if (!month) {
    throw new RangeError(`Bulan tidak valid: ${parts.month}`)
  }
  return `${parts.day} ${month} ${parts.year}`
}

/**
 * Mengambil tanggal kalender dari suatu momen menurut zona waktu workspace.
 * Tanggal disimpan UTC, jadi tanpa ini laporan bisa bergeser sehari.
 */
export function toDateParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)
    return Number.parseInt(found?.value ?? '0', 10)
  }
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return formatDate(toDateParts(date, timeZone))
}

/** Suffix nama berkas untuk ekspor dan faktur, selalu tanpa spasi. */
export function fileDateStamp(date: Date, timeZone: string): string {
  const parts = toDateParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
