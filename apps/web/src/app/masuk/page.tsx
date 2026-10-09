import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke workspace Sahabat UMKM Anda.',
}

/**
 * Halaman ini adalah komponen server supaya isiannya sudah ada di HTML hasil
 * render pertama. Kalau halaman memakai useSearchParams, Next.js harus menunda
 * seluruh isi ke peramban, dan halaman yang terbuka hanya berisi "memuat",
 * termasuk bagi pembaca layar dan mesin pencari.
 *
 * Parameter hanya dibaca di server lalu diteruskan sebagai properti, jadi formnya
 * tidak perlu useSearchParams sama sekali.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string): string => {
    const value = params[key]
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  }

  return (
    <LoginForm
      nextPath={first('next')}
      justRegistered={first('terdaftar') === '1'}
      justReset={first('kata-sandi-diubah') === '1'}
    />
  )
}
