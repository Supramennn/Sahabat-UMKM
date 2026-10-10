import type { Metadata } from 'next'
import VerifyEmailForm from './verify-email-form'

export const metadata: Metadata = {
  title: 'Verifikasi email',
  description: 'Verifikasi email Sahabat UMKM Anda.',
  // Halaman ini menerima token lewat tautan email, jadi tidak boleh masuk indeks
  // mesin pencari (A-11 memakai aturan yang sama untuk tautan baca-saja).
  robots: { index: false, follow: false },
}

/**
 * Token dibaca di server lalu diteruskan ke formulir. Formulirnya tetap komponen
 * client karena bagian yang mengirim permintaan.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.token
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  return <VerifyEmailForm token={token} />
}
