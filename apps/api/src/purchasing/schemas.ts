import { z } from 'zod'
import { MAX_QUANTITY_DECIMALS } from '@sahabat/shared'

/**
 * Skema pembelian (PRD 6.3). Jumlah dan nominal memakai bentuk teks lalu dikembalikan
 * sebagai angka, sama seperti modul stok, supaya angka dari keypad ponsel boleh memakai
 * koma sebagai pemisah ribuan tanpa diterima diam-diam sebagai harga salah.
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

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Nama supplier minimal 2 karakter.').max(120),
  contactName: z.string().trim().max(120).nullable().optional(),
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
  paymentTermDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export const updateSupplierSchema = createSupplierSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })

export const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: quantityField,
  unitPrice: rupiahField,
  discountAmount: optionalRupiahField,
  note: z.string().trim().max(300).nullable().optional(),
})

export const createOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  orderedOn: dateSchema.optional(),
  expectedOn: optionalDateSchema,
  note: z.string().trim().max(500).nullable().optional(),
  items: z.array(orderItemSchema).min(1, 'PO harus punya minimal satu barang.').max(500),
})

export const updateOrderSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  expectedOn: optionalDateSchema,
  note: z.string().trim().max(500).nullable().optional(),
  items: z.array(orderItemSchema).min(1).max(500).optional(),
  /** Wajib saat PO sudah disetujui: PRD 6.3 minta catatan alasan untuk revisi. */
  revisionReason: z.string().trim().max(300).nullable().optional(),
})

export const submitOrderSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
})

export const decideOrderSchema = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
})

export const closeOrderSchema = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
})

export const receiptItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: quantityField,
  expiresAt: optionalDateSchema,
  unitPrice: optionalRupiahField,
})

export const createReceiptSchema = z.object({
  purchaseOrderId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().optional(),
  receivedOn: dateSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  items: z.array(receiptItemSchema).min(1, 'Penerimaan harus punya minimal satu barang.').max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const returnItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: quantityField,
  unitPrice: optionalRupiahField,
})

export const createReturnSchema = z.object({
  purchaseOrderId: z.coerce.number().int().positive().nullable().optional(),
  supplierId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  returnedOn: dateSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  items: z.array(returnItemSchema).min(1, 'Retur harus punya minimal satu barang.').max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const createPaymentSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  purchaseOrderId: z.coerce.number().int().positive().nullable().optional(),
  paidOn: dateSchema.optional(),
  amount: rupiahField,
  method: z.string().trim().min(2, 'Metode pembayaran wajib diisi.').max(60),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export const listOrdersQuerySchema = z.object({
  status: z
    .enum([
      'draft',
      'diajukan',
      'disetujui',
      'ditolak',
      'dibatalkan',
      'diterima_sebagian',
      'diterima',
      'ditutup',
    ])
    .optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type OrderItemInput = z.infer<typeof orderItemSchema>
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>
