/**
 * Pilihan zona waktu yang dipakai formulir usaha. Nilainya nama IANA karena itu
 * yang disimpan database, labelnya memakai sebutan waktu yang dikenal pengguna.
 */
export const timezoneOptions = [
  { value: 'Asia/Jakarta', label: 'WIB (UTC+7) - Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA (UTC+8) - Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT (UTC+9) - Jayapura' },
]

export function timezoneOptionsWith(current: string) {
  if (timezoneOptions.some((option) => option.value === current)) {
    return timezoneOptions
  }
  return [{ value: current, label: current }, ...timezoneOptions]
}
