import { apiPost, errorMessage, type ApiResult } from './api'

/**
 * Penopang perangkat offline (PRD 10).
 *
 * Isian stok yang dibuat saat sinyal hilang masuk antrean dengan status yang
 * terlihat, dan tidak pernah dianggap tersimpan sebelum server mengonfirmasi.
 * Kunci idempotensi ikut disimpan di baris antrean, jadi kirim ulang yang sama
 * menghasilkan satu baris ledger, bukan dua (PRD 6.4 dan mitigasi PRD 20).
 *
 * Antrean disimpan di localStorage peramban yang sama dengan halaman, karena
 * isinya hanya draf isian yang belum dikirim. Data utama tetap di server.
 * Bila isian antrean rusak atau tidak dikenal, entri itu dilewati dan tidak
 * pernah diklaim terkirim.
 */

export type StatusAntrean = 'menunggu' | 'gagal'

export type JenisCatatanStok = 'masuk' | 'keluar' | 'penyesuaian_naik' | 'penyesuaian_turun'

/** Isian formulir Catat stok yang dibawa verbatim ke /stock/movements. */
export interface PayloadStokOffline {
  productId: number
  locationId: number
  kind: JenisCatatanStok
  quantity: string
  reasonCode: string
  unitCost?: string | undefined
  reference: string | null
  note: string | null
  expiresAt: string | null
  idempotencyKey: string
}

export interface EntriAntreanStok {
  id: string
  workspaceId: number
  status: StatusAntrean
  /** ISO waktu isian dibuat, bukan waktu tersalin. */
  createdAt: string
  attempts: number
  pesanGagal: string | null
  payload: PayloadStokOffline
}

export interface Penyimpanan {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface BalasanCatatanStok {
  balanceAfter: number
  replayed: boolean
}

const KUNCI_ANTREAN = 'sahabat-antrean-stok'
const KUNCI_AWALAN = 'sahabat-draf-daftar'

function penyimpananDefault(): Penyimpanan | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

/** Pemeriksa bentuk. Bila isian tidak lengkap, entri itu diabaikan, bukan diperbaiki diam-diam. */
function berbentukEntri(nilai: unknown): nilai is EntriAntreanStok {
  if (typeof nilai !== 'object' || nilai === null) return false
  const entri = nilai as Record<string, unknown>
  const payload = entri.payload
  return (
    typeof entri.id === 'string' &&
    typeof entri.workspaceId === 'number' &&
    (entri.status === 'menunggu' || entri.status === 'gagal') &&
    typeof entri.createdAt === 'string' &&
    typeof entri.attempts === 'number' &&
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as PayloadStokOffline).quantity === 'string'
  )
}

export function bacaAntreanStok(penyimpanan: Penyimpanan | null = penyimpananDefault()): EntriAntreanStok[] {
  if (!penyimpanan) return []
  try {
    const mentah = penyimpanan.getItem(KUNCI_ANTREAN)
    if (!mentah) return []
    const hasil: unknown = JSON.parse(mentah)
    if (!Array.isArray(hasil)) return []
    return hasil.filter(berbentukEntri)
  } catch {
    return []
  }
}

function tulisAntrean(entriDaftar: EntriAntreanStok[], penyimpanan: Penyimpanan | null): void {
  if (!penyimpanan) return
  try {
    penyimpanan.setItem(KUNCI_ANTREAN, JSON.stringify(entriDaftar))
  } catch {
    // Penyimpanan bisa penuh atau ditutup situs. Antrean tak tersalin bukan
    // kehilangan data utama: isian itu memang belum pernah terkirim.
  }
}

export function tambahCatatanStok(input: {
  workspaceId: number
  payload: PayloadStokOffline
  penyimpanan?: Penyimpanan | null
}): EntriAntreanStok {
  const penyimpanan = input.penyimpanan ?? penyimpananDefault()
  const entri: EntriAntreanStok = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    workspaceId: input.workspaceId,
    status: 'menunggu',
    createdAt: new Date().toISOString(),
    attempts: 0,
    pesanGagal: null,
    payload: input.payload,
  }
  tulisAntrean([...bacaAntreanStok(penyimpanan), entri], penyimpanan)
  return entri
}

function tandaiHinggaAtas(id: string, ubah: (entri: EntriAntreanStok) => EntriAntreanStok, penyimpanan: Penyimpanan | null): void {
  if (!penyimpanan) return
  tulisAntrean(
    bacaAntreanStok(penyimpanan).map((entri) => (entri.id === id ? ubah(entri) : entri)),
    penyimpanan,
  )
}

export function ubahStatusAntrean(
  id: string,
  patch: { status?: StatusAntrean; pesanGagal?: string | null; attempts?: number },
  penyimpanan: Penyimpanan | null = penyimpananDefault(),
): void {
  tandaiHinggaAtas(id, (entri) => ({ ...entri, ...patch }), penyimpanan)
}

export function hapusCatatanAntrean(id: string, penyimpanan: Penyimpanan | null = penyimpananDefault()): void {
  if (!penyimpanan) return
  tulisAntrean(
    bacaAntreanStok(penyimpanan).filter((entri) => entri.id !== id),
    penyimpanan,
  )
}

export interface HasilKirimAntrean {
  terkirim: number
  ditolak: number
  masihOffline: boolean
}

/**
 * Mengirim satu atau lebih entri antrean dalam urutan dibuatnya. Balasan
 * 'jaringan' memutus perulangan karena kiriman berikutnya pasti gagal juga.
 * Balasan penolakan server menandai entri 'gagal' dengan pesan server, supaya
 * isian tidak dianggap tersimpan dan pengguna bisa memutuskan langkahnya.
 */
export async function kirimAntreanStok(options: {
  workspaceId: number
  idTerpilih?: string | undefined
  kirim: (payload: PayloadStokOffline) => Promise<ApiResult<BalasanCatatanStok>>
  penyimpanan?: Penyimpanan | null
}): Promise<HasilKirimAntrean> {
  const penyimpanan = options.penyimpanan ?? penyimpananDefault()
  const entri = bacaAntreanStok(penyimpanan)
    .filter((item) => item.workspaceId === options.workspaceId && item.status === 'menunggu')
    .filter((item) => (options.idTerpilih === undefined ? true : item.id === options.idTerpilih))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const hasil: HasilKirimAntrean = { terkirim: 0, ditolak: 0, masihOffline: false }

  for (const item of entri) {
    const balasan = await options.kirim(item.payload)
    if (balasan.ok) {
      hapusCatatanAntrean(item.id, penyimpanan)
      hasil.terkirim += 1
      continue
    }
    if (balasan.error.error === 'jaringan') {
      hasil.masihOffline = true
      break
    }
    ubahStatusAntrean(item.id, { status: 'gagal', pesanGagal: errorMessage(balasan.error, 'Server menolak catatan ini.') }, penyimpanan)
    hasil.ditolak += 1
  }

  return hasil
}

/** Bungkus panggilan penyesuaian stok supaya formulir dan antrean memakai jalur yang sama. */
export function kirimCatatanStok(workspaceId: number, payload: PayloadStokOffline): Promise<ApiResult<BalasanCatatanStok>> {
  return apiPost<BalasanCatatanStok>(`/api/workspaces/${workspaceId}/stock/movements`, payload)
}

/* Salinan daftar untuk halaman yang sudah dibuka saat offline ----------------- */

export interface SalinanDaftar<T> {
  data: T
  disimpanPada: string
}

export function simpanDaftar<T>(input: {
  workspaceId: number
  kunci: string
  data: T
  penyimpanan?: Penyimpanan | null
}): void {
  const penyimpanan = input.penyimpanan ?? penyimpananDefault()
  if (!penyimpanan) return
  try {
    penyimpanan.setItem(
      `${KUNCI_AWALAN}:${input.workspaceId}:${input.kunci}`,
      JSON.stringify({ data: input.data, disimpanPada: new Date().toISOString() }),
    )
  } catch {
    // Salinan pendukung boleh gagal disimpan; halaman tetap berjalan online.
  }
}

export function bacaDaftar<T>(input: {
  workspaceId: number
  kunci: string
  penyimpanan?: Penyimpanan | null
}): SalinanDaftar<T> | null {
  const penyimpanan = input.penyimpanan ?? penyimpananDefault()
  try {
    const mentah = penyimpanan?.getItem(`${KUNCI_AWALAN}:${input.workspaceId}:${input.kunci}`) ?? null
    if (!mentah) return null
    const hasil: unknown = JSON.parse(mentah)
    if (typeof hasil !== 'object' || hasil === null) return null
    const salinan = hasil as { data?: unknown; disimpanPada?: unknown }
    if (typeof salinan.data !== 'object' || salinan.data === null) return null
    if (typeof salinan.disimpanPada !== 'string') return null
    return { data: salinan.data as T, disimpanPada: salinan.disimpanPada }
  } catch {
    return null
  }
}

/** Waktu salinan dibuat supaya pengguna tahu usianya data yang tampil. */
export function labelSalinan(disimpanPada: string): string {
  const waktu = new Date(disimpanPada)
  if (Number.isNaN(waktu.getTime())) return ''
  const bentuk = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  return bentuk.format(waktu)
}
