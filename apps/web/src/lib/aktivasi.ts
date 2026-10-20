import type { OnboardingResponse, OnboardingStep } from './api'

/**
 * Pemeriksaan daftar aktivasi di dashboard (PRD 12).
 *
 * Keadaan langkah adalah teks, bukan warna saja (PRD 10: status tidak hanya
 * dibedakan lewat warna). Daftar hanya tampil saat ada langkah yang masih
 * dibuka; langkah yang selesai atau sengaja dilewati membuat kartunya hilang.
 */

export type KeadaanLangkah = 'selesai' | 'dilewati' | 'belum'

export function keadaanLangkah(langkah: OnboardingStep): KeadaanLangkah {
  if (langkah.done) return 'selesai'
  if (langkah.skipped) return 'dilewati'
  return 'belum'
}

export function teksKeadaanLangkah(keadaan: KeadaanLangkah): string {
  if (keadaan === 'selesai') return 'Selesai'
  if (keadaan === 'dilewati') return 'Dilewati'
  return 'Belum selesai'
}

export function kelasBadgeLangkah(keadaan: KeadaanLangkah): string {
  if (keadaan === 'selesai') return 'border-success text-success'
  if (keadaan === 'dilewati') return 'border-warning text-warning'
  return 'border-border-strong text-text-secondary'
}

/** Daftar kartunya tampil bila ada langkah yang masih benar-benar dibuka. */
export function langkahPerluTampil(checklist: OnboardingResponse): boolean {
  return checklist.langkah.some((langkah) => !langkah.done && !langkah.skipped)
}

/**
 * Melompati langkah mengubah tampilan semua anggota workspace, jadi perannya
 * diperiksa di server dan tombolnya hanya dipasang untuk Owner dan Admin.
 */
export function bolehMelompatiLangkah(role: string): boolean {
  return role === 'owner' || role === 'admin'
}
