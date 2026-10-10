import { z } from 'zod'
import { MINIMUM_PASSWORD_LENGTH } from './password.ts'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Format email tidak valid.')

export const passwordSchema = z
  .string()
  .min(MINIMUM_PASSWORD_LENGTH, `Kata sandi minimal ${MINIMUM_PASSWORD_LENGTH} karakter.`)
  .max(200, 'Kata sandi terlalu panjang.')

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(120),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Kata sandi wajib diisi.').max(200),
  workspaceId: z.coerce.number().int().positive().optional(),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

/**
 * Token verifikasi email dan atur ulang kata sandi sama-sama 32 byte acak dalam
 * base64url, jadi panjangnya selalu 43 karakter. Rentang 10 sampai 200 menyisakan
 * tempat untuk format token lain tanpa menerima sembarang isian.
 */
const tokenSchema = z.string().min(10).max(200)

export const verifyEmailSchema = z.object({
  token: tokenSchema,
})

export const resendVerificationSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi lama wajib diisi.').max(200),
  newPassword: passwordSchema,
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(120),
})

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi wajib diisi.').max(200),
  newEmail: emailSchema,
})

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Nama usaha minimal 2 karakter.').max(120),
  businessType: z.string().trim().max(60).optional(),
  timezone: z.string().trim().max(60).default('Asia/Jakarta'),
})

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  businessType: z.string().trim().max(60).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  logoKey: z.string().trim().max(255).nullable().optional(),
})

export const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'purchasing', 'staff', 'viewer']),
})

export const updateMembershipSchema = z.object({
  role: z.enum(['admin', 'purchasing', 'staff', 'viewer']),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>
export type InvitationInput = z.infer<typeof invitationSchema>
