import { z } from 'zod'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'

/**
 * Skema isian angka dan tanggal yang dipakai bersama modul pembelian, penjualan,
 * dan pengeluaran.
 *
 * Angka masuk sebagai teks lalu dikembalikan sebagai angka, bukan diambil apa adanya
 * sebagai angka. Alasannya format yang diketik orang berbeda antara papan nomor
 * ponsel dan keyboard: "12.500" bisa berarti dua belas koma lima ratus di satu
 * tempat dan dua belas ribu lima ratus di tempat lain. Kalau diterima langsung
 * sebagai angka, kesalahan ketik masuk ke database tanpa pernah ditanyakan.
 *
 * Jumlah dibatasi empat angka desimal (K-12). Presisi yang lebih tinggi ditolak,
 * bukan dipotong, karena selisih yang hilang akan muncul sebagai selisih stok
 * opname yang tidak bisa dijelaskan.
 */

export function quantityFromText(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Jumlah harus angka positif: ${text}`)
  }
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Jumlah harus lebih besar dari nol: ${text}`)
  }
  const scaled = value * 10 ** MAX_QUANTITY_DECIMALS
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new Error(`Jumlah hanya boleh ${MAX_QUANTITY_DECIMALS} angka desimal: ${text}`)
  }
  return value
}

export function rupiahFromText(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Nominal harus angka: ${text}`)
  }
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Nominal harus lebih besar dari nol: ${text}`)
  }
  return Math.round(value)
}

export const quantityField = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return quantityFromText(typeof value === 'number' ? String(value) : value)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message })
    return z.NEVER
  }
})

export const rupiahField = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return rupiahFromText(typeof value === 'number' ? String(value) : value)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message })
    return z.NEVER
  }
})

export const optionalRupiahField = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') {
      return null
    }
    try {
      return rupiahFromText(typeof value === 'number' ? String(value) : value)
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message })
      return z.NEVER
    }
  })

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD.')

export const optionalDateSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') {
      return null
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal harus format YYYY-MM-DD.' })
      return z.NEVER
    }
    return value
  })

/**
 * Nama bebas yang boleh diubah lewat teks bebas: metode pembayaran, alasan, catatan.
 *
 * `undefined` berarti kolom tidak ikut dikirim dan nilai lama tidak berubah. `null`
 * berarti kolom sengaja dikosongkan. Dua hal itu dibedakan karena form yang hanya
 * mengubah satu field tidak boleh diam-diam mengosongkan field lain.
 */
export function optionalTrimmedText(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined) {
        return undefined
      }
      const trimmed = (value ?? '').trim()
      return trimmed === '' ? null : trimmed.slice(0, max)
    })
}