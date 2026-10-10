import { z } from 'zod'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'
import { movementKinds } from './movements.ts'

/**
 * Isian dari peramban selalu berupa teks, dan angka dari keypad ponsel bisa punya
 * koma sebagai pemisah ribuan. Skema di sini menerima teks, memeriksa presisinya,
 * lalu mengembalikannya sebagai angka, supaya tidak ada pathway yang menulis
 * pecahan yang lebih kecil dari yang bisa disimpan database.
 */

function quantityFromText(text: string): number {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Jumlah harus angka positif tanpa tanda: ${text}`)
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

/** Harga dalam rupiah penuh tanpa pecahan (KEPUTUSAN-TEKNIS bagian 3). */
function rupiahFromText(text: string): number {
  const normalized = text.trim().replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Nominal harus angka: ${text}`)
  }
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Nominal tidak boleh negatif: ${text}`)
  }
  return Math.round(value)
}

const quantityField = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return quantityFromText(typeof value === 'number' ? String(value) : value)
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message })
      return z.NEVER
    }
  })

const optionalRupiahField = z
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

const optionalQuantityField = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') {
      return null
    }
    try {
      return quantityFromText(typeof value === 'number' ? String(value) : value)
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message })
      return z.NEVER
    }
  })

/** Tanggal kalender bentuk YYYY-MM-DD. Waktu disimpan UTC, hari dihitung per zona waktu. */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD.')

const optionalDateSchema = z
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

export const unitCodes = [
  'pcs',
  'bungkus',
  'box',
  'karung',
  'lusin',
  'rim',
  'pack',
  'sachet',
  'kg',
  'gram',
  'ons',
  'liter',
  'ml',
  'galon',
  'dozen',
  'paket',
] as const

export const productStatusSchema = z.enum(['aktif', 'nonaktif', 'diarsipkan'])

export const createProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU wajib diisi.').max(64),
  name: z.string().trim().min(2, 'Nama produk minimal 2 karakter.').max(160),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  unitCode: z.enum(unitCodes),
  referencePurchasePrice: optionalRupiahField,
  sellingPrice: optionalRupiahField,
  minStock: optionalQuantityField,
  photoKey: z.string().trim().max(255).nullable().optional(),
})

export const updateProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    unitCode: z.enum(unitCodes).optional(),
    referencePurchasePrice: optionalRupiahField,
    sellingPrice: optionalRupiahField,
    minStock: optionalQuantityField,
    status: productStatusSchema.optional(),
    photoKey: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada yang diubah.',
  })

export const listProductsQuerySchema = z.object({
  status: productStatusSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter.').max(80),
})

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
})

export const createLocationSchema = z.object({
  name: z.string().trim().min(2, 'Nama lokasi minimal 2 karakter.').max(120),
  code: z.string().trim().max(20).nullable().optional(),
})

export const updateLocationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().max(20).nullable().optional(),
  isArchived: z.boolean().optional(),
})

export const createMovementSchema = z.object({
  productId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  kind: z.enum(movementKinds as [string, ...string[]]),
  quantity: quantityField,
  unitCost: optionalRupiahField,
  expiresAt: optionalDateSchema,
  reasonCode: z.string().trim().min(1, 'Alasan wajib diisi.').max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  occurredOn: dateSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(120).nullable().optional(),
})

export const listMovementsQuerySchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  kind: z.enum(movementKinds as [string, ...string[]]).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const listBalancesQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  onlyProblem: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

/**
 * Jendela kedaluwarsa dalam hari. PRD 6.2 menyebut peringatan hampir kedaluwarsa
 * tanpa memberi angka, jadi jumlahnya diminta dari pengguna, bukan ditebak di
 * server: angka yang salah akan menampilkan barang yang belum perlu diproses.
 */
export const expiryAlertsQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  withinDays: z.coerce.number().int().min(1).max(365).default(30),
})

export const startCountSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).nullable().optional(),
})

export const recordCountItemSchema = z.object({
  countedQuantity: quantityField,
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateMovementInput = z.infer<typeof createMovementSchema>
