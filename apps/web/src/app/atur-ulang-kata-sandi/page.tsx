import type { Metadata } from 'next'
import ResetPasswordForm from './reset-password-form'

export const metadata: Metadata = {
  title: 'Buat kata sandi baru',
  description: 'Atur ulang kata sandi Sahabat UMKM Anda.',
}

/**
 * Token dibaca di server lalu diteruskan ke formulir, jadi isi halaman sudah ada
 * di HTML hasil render pertama. Formulirnya tetap komponen client karena itu
 * bagian yang mengirim permintaan.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.token
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  return <ResetPasswordForm token={token} />
}
