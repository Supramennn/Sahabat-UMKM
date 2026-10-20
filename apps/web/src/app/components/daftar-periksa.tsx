'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPatch, errorMessage, type OnboardingResponse } from '../../lib/api'
import {
  bolehMelompatiLangkah,
  kelasBadgeLangkah,
  keadaanLangkah,
  langkahPerluTampil,
  teksKeadaanLangkah,
} from '../../lib/aktivasi'
import { useApp } from './app-context'

/**
 * Daftar periksa aktivasi (PRD 12).
 *
 * Langkah yang selesai dihitung server dari data workspace, bukan dicentang
 * saat pengguna membuka halaman linknya. Langkah opsional bisa dilewati dan
 * ditemukan lagi di daftar ini, sesuai PRD 12. Kartu hilang bila semua langkah
 * selesai atau dilewati, jadi dashboard pengguna baru menerima panduan dan
 * dashboard pengguna lama tidak menyimpan kartu yang tidak relevan.
 */

const BADGE = 'inline-flex items-center rounded-badge border px-2 py-0.5 text-xs font-medium'
const TOMBOL_TAUTAN =
  'inline-flex min-h-touch items-center rounded-control border border-border-strong bg-surface px-3 text-[0.9375rem] font-medium text-secondary transition-colors duration-150 hover:border-text-secondary'
const TOMBOL_LANGKAH =
  'min-h-touch cursor-pointer bg-transparent px-2 text-left text-[0.9375rem] font-medium text-secondary underline enabled:hover:decoration-2 '

export function DaftarPeriksaAktivasi() {
  const app = useApp()
  const [checklist, setChecklist] = useState<OnboardingResponse | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [galat, setGalat] = useState<string | null>(null)

  useEffect(() => {
    let berhenti = false

    void apiGet<OnboardingResponse>(`/api/workspaces/${app.workspaceId}/onboarding`).then((hasil) => {
      if (berhenti) return
      if (hasil.ok) {
        setChecklist(hasil.data)
      }
      // Gagal memuat daftar ini tidak mengganggu dashboard: kartu panduan
      // tinggal tidak tampil, sisanya tetap terbaca.
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId])

  if (!checklist || !langkahPerluTampil(checklist)) {
    return null
  }

  const bolehMelompati = bolehMelompatiLangkah(app.role)

  async function ubahLangkah(step: string, skipped: boolean) {
    setBusy(step)
    setGalat(null)
    const hasil = await apiPatch<OnboardingResponse>(`/api/workspaces/${app.workspaceId}/onboarding`, { step, skipped })
    setBusy(null)
    if (hasil.ok) {
      setChecklist(hasil.data)
    } else {
      setGalat(errorMessage(hasil.error, 'Langkah tidak bisa diubah.'))
    }
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
      aria-labelledby="judul-daftar-periksa"
    >
      <h2 className="text-lg font-semibold" id="judul-daftar-periksa">
        Daftar periksa aktivasi
      </h2>
      <p className="text-[0.9375rem] text-text-secondary">
        Langkah awal untuk mulai memakai usaha ini. Langkah opsional bisa dilewati dan dibuka lagi dari daftar ini.
      </p>
      {galat ? (
        <p className="text-sm text-danger" role="alert">
          {galat}
        </p>
      ) : null}
      <ol className="flex flex-col">
        {checklist.langkah.map((langkah) => {
          const keadaan = keadaanLangkah(langkah)
          return (
            <li key={langkah.key} className="flex flex-col gap-1 border-t border-border-subtle py-2 first:border-t-0 first:pb-2 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[0.9375rem]">{langkah.label}</strong>
                <span className={`${BADGE} ${kelasBadgeLangkah(keadaan)}`}>{teksKeadaanLangkah(keadaan)}</span>
              </div>
              <p className="text-[0.9375rem] text-text-secondary">{langkah.detail}</p>
              {!langkah.done ? (
                <ul className="flex flex-col gap-0.5 text-[0.9375rem] text-text-secondary">
                  {langkah.sisa.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <a className={TOMBOL_TAUTAN} href={langkah.href}>
                  Buka halaman
                </a>
                {bolehMelompati && !langkah.done ? (
                  <button
                    type="button"
                    className={TOMBOL_LANGKAH}
                    disabled={busy === langkah.key}
                    onClick={() => void ubahLangkah(langkah.key, !langkah.skipped)}
                  >
                    {busy === langkah.key ? 'Menyimpan' : langkah.skipped ? 'Buka lagi langkah ini' : 'Lewati langkah ini'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
