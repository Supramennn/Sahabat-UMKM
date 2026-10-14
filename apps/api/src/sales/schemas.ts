import { z } from 'zod'
import {
  optionalDateSchema,
  optionalRupiahField,
  optionalTrimmedText,
  quantityField,
  rupiahField,
} from '../common/input.ts'

/**
 * Skema penjualan (PRD 6.4). Metode pembayaran memakai teks, bukan daftar tetap,
 * karena kasir sering mencatat penjualan sebelum Owner sempat mengatur daftar di
 * Pengaturan (B-07).
 */

export const createSaleSchema = z.object({
  soldOn: optionalDateSchema,
  locationId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  // Dikirim hanya kalau metode diambil dari daftar yang sudah diatur. Kalau tidak,
  // labelnya yang dipakai dan paymentMethodId dibiarkan kosong.
  paymentMethodId: z.coerce.number().int().positive().nullable().optional(),
  paymentMethodLabel: z
    .string()
    .trim()
    .min(2, 'Metode pembayaran wajib diisi.')
    .max(60, 'Metode pembayaran maksimal 60 karakter.'),
  note: optionalTrimmedText(500),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        quantity: quantityField,
        unitPrice: rupiahField,
        discountAmount: optionalRupiahField,
        note: optionalTrimmedText(300),
      }),
    )
    .min(1, 'Penjualan harus punya minimal satu barang.')
    .max(200),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const cancelSaleSchema = z.object({
  reason: optionalTrimmedText(300),
  cancelledOn: optionalDateSchema,
})

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Nama pelanggan minimal 2 karakter.').max(120),
  phone: optionalTrimmedText(40),
  note: optionalTrimmedText(500),
})

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(2, 'Nama metode minimal 2 karakter.').max(60),
})

export const updatePaymentMethodSchema = createPaymentMethodSchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })

export const listSalesQuerySchema = z.object({
  from: optionalDateSchema,
  to: optionalDateSchema,
  locationId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  status: z.enum(['selesai', 'dibatalkan', 'semua']).default('selesai'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type CreateSaleInputDto = z.infer<typeof createSaleSchema>
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>