import type { Metadata } from 'next'
import AcceptInvitationForm from './accept-form'

export const metadata: Metadata = {
  title: 'Terima undangan',
  description: 'Terima undangan bergabung ke usaha di Sahabat UMKM.',
}

/**
 * Token dibaca di server lalu diteruskan sebagai properti, sama seperti halaman
 * masuk, supaya isi halaman tidak tertunda oleh useSearchParams di peramban.
 */
export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.token
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  return <AcceptInvitationForm token={token} />
}
