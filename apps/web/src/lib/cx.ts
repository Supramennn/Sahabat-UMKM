/**
 * Menggabungkan kelas Tailwind yang sebagian boleh kosong. Tanpa dependensi
 * tambahan; cukup untuk pola kelas kondisional yang dipakai aplikasi ini.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
