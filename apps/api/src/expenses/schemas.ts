import { z } from 'zod'
import { optionalDateSchema, optionalTrimmedText, rupiahField } from '../common/input.ts'

/**
 * Skema pengeluaran (PRD 6.5). Kategori boleh kosong supaya pengeluaran bisa dicatat
 * pada hari pertama saat workspace belum punya kategori apa pun, tapi nama kategori
 * selalu ikut dibaca supaya peringatan bisa diperiksa sebelum disimpan.
 */

export const createExpenseSchema = z.object({
  spentOn: optionalDateSchema,
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  categoryName: optionalTrimmedText(120),
  description: z.string().trim().min(2, 'Deskripsi minimal 2 karakter.').max(300),
  amount: rupiahField,
  reference: optionalTrimmedText(120),
  purchaseOrderId: z.coerce.number().int().positive().nullable().optional(),
})

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter.').max(120),
})

export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .extend({ isArchived: z.boolean().optional() })

export const listExpensesQuerySchema = z.object({
  from: optionalDateSchema,
  to: optionalDateSchema,
  categoryId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const attachmentUploadSchema = z.object({
  contentType: z.string().min(1).max(120),
  /** Nama berkas asli, hanya untuk ditampilkan di daftar lampiran. */
  fileName: z.string().trim().min(1).max(200),
  data: z.string().min(1).max(Math.ceil(5 * 1024 * 1024 * 1.4)),
})

export const idParamSchema = z.string().regex(/^\d+$/, 'Alamat tidak valid.')

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>
