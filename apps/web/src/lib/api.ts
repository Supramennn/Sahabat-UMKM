/**
 * Klien API untuk sisi peramban.
 *
 * Semua panggilan memakai credentials: 'include' karena sesi memakai cookie
 * HttpOnly. Token tidak pernah menyentuh JavaScript, sehingga halaman tidak
 * perlu menangani penyimpanan token dan tidak ada token yang bisa dicuri lewat
 * penyisipan skrip.
 *
 * Semua balasan galat membawa bentuk yang sama, jadi satu komponen bisa
 * menampilkannya tanpa memeriksa bentuk per endpoint (PRD 10).
 */

export interface ApiError {
  error: string
  message?: string
  problems?: string[]
  fields?: Array<{ path: string; message: string }>
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }


/**
 * Host API harus sama dengan asal halaman. API hanya mengizinkan satu asal, jadi
 * memakai 127.0.0.1 sementara halaman dibuka lewat localhost membuat setiap
 * permintaan ditolak dan halaman tampak seperti jaringan bermasalah.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    return { ok: false, error: { error: 'jaringan', message: 'Tidak bisa menghubungi server.' } }
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T }
  }

  let parsed: unknown = {}
  try {
    parsed = await response.json()
  } catch {
    parsed = {}
  }

  if (!response.ok) {
    return { ok: false, error: parsed as ApiError }
  }

  return { ok: true, data: parsed as T }
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  // Body kosong tidak dikirim sama sekali, bukan dikirim sebagai undefined, karena
  // fetch akan memperlakukannya berbeda dan Content-Type jadi tidak perlu.
  if (body === undefined) {
    return request<T>(path, { method: 'POST' })
  }
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function apiPatch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'DELETE' })
}

/** Pesan yang bisa ditampilkan ke pengguna dari galat apa pun. */
export function errorMessage(error: ApiError, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  if (error.problems && error.problems.length > 0) {
    return error.problems.join(' ')
  }
  if (error.message) {
    return error.message
  }
  return fallback
}

export type SessionResponse = {
  user: {
    id: number
    email: string
    name: string
    emailVerified: boolean
    mfaRequiredAt: string | null
  }
  activeWorkspaceId: number | null
  workspaces: Array<{ id: number; name: string; slug: string; role: string }>
  mfaSatisfied: boolean
}

export type LoginResponse = {
  userId: number
  workspaceId: number | null
  mfaRequired: boolean
}

export type MfaVerifyResponse = { verified: boolean; workspaceId: number | null }

export type MfaSetupResponse = { secret: string; uri: string; expiresInMinutes: number }

export type RecoveryCodesResponse = { confirmed?: boolean; recoveryCodes: string[] }

export type DevicesResponse = {
  devices: Array<{
    id: string
    label: string
    user_agent: string | null
    last_seen_at: string
    active_sessions: number
    current_session: boolean
  }>
}

export type MessageResponse = { message: string }
