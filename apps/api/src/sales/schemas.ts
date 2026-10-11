import { z } from 'zod'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'

/**
 * Skema penjualan (PRD 6.4) dan pengeluaran (PRD 6.5).
 *
 * Jumlah dan nominal memakai bentuk teks lalu dikembalikan sebagai angka,
 * supaya angka dari keypad ponsel boleh memakai koma sebagai pemisah ribuan
 * tanpa diterima diam-diam sebagai harga salah.
 */

function quantityFromText(text: string): number {
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

function rupiahFromText(text: string): number {
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

const quantityField = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return quantityFromText(typeof value === 'number' ? String(value) : value)
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message })
    return z.NEVER
  }
})

const rupiahField = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return rupiahFromText(typeof value === 'number' ? String(value) : value)
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD.')

/* Pelanggan ---------------------------------------------------------- */

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Nama pelanggan minimal 2 karakter.').max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: 'Format email tidak valid.',
    })
    .nullable()
    .optional(),
  address: z.string().trim().max(300).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })

/* Penjualan ----------------------------------------------------------- */

export const saleItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: quantityField,
  unitPrice: rupiahField,
  discountAmount: optionalRupiahField,
  note: z.string().trim().max(300).nullable().optional(),
})

export const createSaleSchema = z.object({
  customerId: z.coerce.number().int().positive().nullable().optional(),
  locationId: z.coerce.number().int().positive(),
  soldOn: dateSchema.optional(),
  paymentMethod: z.string().trim().min(2, 'Metode pembayaran wajib diisi.').max(60),
  note: z.string().trim().max(500).nullable().optional(),
  items: z.array(saleItemSchema).min(1, 'Penjualan harus punya minimal satu barang.').max(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
})

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan pembatalan wajib diisi.').max(300),
})

/* Impor penjualan ----------------------------------------------------- */

export const importSaleItemSchema = z.object({
  sku: z.string().trim().min(1, 'SKU wajib diisi.'),
  quantity: quantityField,
  unitPrice: rupiahField,
  discountAmount: optionalRupiahField,
  paymentMethod: z.string().trim().min(2).max(60),
  customerName: z.string().trim().max(120).nullable().optional(),
  customerPhone: z.string().trim().max(40).nullable().optional(),
  locationName: z.string().trim().min(1, 'Lokasi wajib diisi.'),
  note: z.string().trim().max(300).nullable().optional(),
})

export const importSalesSchema = z.object({
  items: z.array(importSaleItemSchema).min(1).max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
})

/* Pengeluaran --------------------------------------------------------- */

export const createExpenseSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  description: z.string().trim().min(3, 'Deskripsi minimal 3 karakter.').max(300),
  amount: rupiahField,
  spentOn: dateSchema.optional(),
  reference: z.string().trim().max(120).nullable().optional(),
})

export const updateExpenseSchema = createExpenseSchema.partial()

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter.').max(80),
})

export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })

/* Metode pembayaran --------------------------------------------------- */

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(2, 'Nama metode minimal 2 karakter.').max(60),
})

export const updatePaymentMethodSchema = createPaymentMethodSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })

/* Kueri daftar -------------------------------------------------------- */

export const listSalesQuerySchema = z.object({
  status: z.enum(['all', 'active', 'cancelled']).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const listCustomersQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const listExpensesQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateSaleInput = z.infer<typeof createSaleSchema>
export type SaleItemInput = z.infer<typeof saleItemSchema>
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>