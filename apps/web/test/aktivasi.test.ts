import { describe, expect, it } from 'vitest'
import {
  bolehMelompatiLangkah,
  kelasBadgeLangkah,
  keadaanLangkah,
  langkahPerluTampil,
  teksKeadaanLangkah,
  type KeadaanLangkah,
} from '../src/lib/aktivasi'
import type { OnboardingResponse, OnboardingStep } from '../src/lib/api'

/**
 * PRD 12: langkah opsional bisa dilewati dan ditemukan lagi lewat daftar
 * periksa di dashboard. PRD 10: status dibedakan dengan teks, bukan warna saja.
 */

function langkah(sifat: Partial<OnboardingStep>): OnboardingStep {
  return {
    key: 'transaksi',
    label: 'Catat transaksi pertama',
    detail: 'Penjualan, penerimaan barang, atau catatan stok lainnya.',
    href: '/penjualan/baru',
    sisa: [],
    done: false,
    skipped: false,
    ...sifat,
  }
}

function checklist(langkahDaftar: OnboardingStep[]): OnboardingResponse {
  return { langkah: langkahDaftar, semuaSelesai: true }
}

describe('keadaan langkah aktivasi', () => {
  it('dipisahkan lewat tanda: selesai, dilewati, atau belum', () => {
    expect(keadaanLangkah(langkah({ done: true, skipped: true }))).toBe('selesai')
    expect(keadaanLangkah(langkah({ done: false, skipped: true }))).toBe('dilewati')
    expect(keadaanLangkah(langkah({ done: false, skipped: false }))).toBe('belum')
  })

  it('setiap keadaan punya teks sendiri, bukan dibedakan warna saja', () => {
    const kenamaan: KeadaanLangkah[] = ['selesai', 'dilewati', 'belum']
    const teks = new Set(kenamaan.map((keadaan) => teksKeadaanLangkah(keadaan)))
    expect(teks).toEqual(new Set(['Selesai', 'Dilewati', 'Belum selesai']))

    const kelas = new Set(kenamaan.map((keadaan) => kelasBadgeLangkah(keadaan)))
    expect(kelas.size).toBe(3)
  })

  it('kartu daftar hanya tampil saat ada langkah yang masih dibuka', () => {
    expect(langkahPerluTampil(checklist([langkah({ done: true }), langkah({ done: true })]))).toBe(false)
    expect(langkahPerluTampil(checklist([langkah({ done: true }), langkah({ skipped: true })]))).toBe(false)
    expect(langkahPerluTampil(checklist([langkah({ skipped: true }), langkah({ skipped: true })]))).toBe(false)
    expect(langkahPerluTampil(checklist([langkah({ done: true }), langkah({})]))).toBe(true)
  })

  it('melompati langkah diperiksa dari data workspace, bukan sekadar tombol', () => {
    for (const role of ['owner', 'admin', 'purchasing', 'staff', 'viewer']) {
      const boleh = bolehMelompatiLangkah(role)
      if (role === 'owner' || role === 'admin') {
        expect(boleh, `peran ${role}`).toBe(true)
      } else {
        expect(boleh, `peran ${role}`).toBe(false)
      }
    }
  })
})
