import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { hashForLookup, hashToken, tokenMatches } from './token.ts'
import { loadMfaGate } from './mfa-policy.ts'
import type { Role } from '@sahabat/shared'

/**
 * Konteks permintaan. Setiap handler yang menyentuh data workspace harus punya
 * `workspaceId` di sini, dan tidak boleh mengambilnya dari parameter rute.
 * PRD 9: ID dari peramban bukan bukti izin.
 */

export const SESSION_COOKIE = 'sahabat_session'

/** Umur cookie sama dengan umur token, jadi cookie tidak bertahan setelah token mati. */
export const SESSION_TTL_DAYS = 30

export interface SessionUser {
  userId: number
  email: string
  name: string
  emailVerified: boolean
  mfaRequiredAt: Date | null
  sessionId: string
  workspaceId: number | null
  mfaSatisfiedAt: Date | null
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: SessionUser
    workspaceRole?: Role
  }
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    // SameSite Lax mencegah cookie ikut pada permintaan lintas situs, dan tetap
    // mengizinkan navigasi dari tautan luar seperti email verifikasi.
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' })
}

interface RawSessionRow {
  session_id: string
  user_id: number
  email: string
  name: string
  email_verified_at: Date | null
  mfa_required_at: Date | null
  mfa_satisfied_at: Date | null
  active_workspace_id: number | null
}

export async function loadSessionForToken(db: Database, token: string): Promise<SessionUser | null> {
  const result = await db.query<RawSessionRow>(
    `select s.id as session_id, u.id as user_id, u.email, u.name,
            u.email_verified_at, u.mfa_required_at, s.mfa_satisfied_at,
            s.active_workspace_id
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.deleted_at is null`,
    [hashToken(token)],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified_at !== null,
    mfaRequiredAt: row.mfa_required_at,
    mfaSatisfiedAt: row.mfa_satisfied_at,
    sessionId: row.session_id,
    workspaceId: row.active_workspace_id,
  }
}

/**
 * PRD 9: sesi diputar ulang setelah masuk. Everytime token yang sama dipakai lagi,
 * sesi lama dicabut dan sesi baru diterbitkan, jadi token yang pernah dicuri hanya
 * berlaku sampai permintaan berikutnya.
 */
export async function rotateSession(
  db: Database,
  previousToken: string,
  reply: FastifyReply,
  context: { ip?: string | null; userAgent?: string | null; workspaceId?: number | null; mfaSatisfied?: boolean },
  secure: boolean,
): Promise<string | null> {
  const previousHash = hashToken(previousToken)
  const previous = await db.query<{ user_id: number }>(
    'update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null returning user_id',
    [previousHash],
  )
  const userId = previous.rows[0]?.user_id
  if (userId === undefined) {
    return null
  }

  const issued = await issueSession(db, {
    userId,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    workspaceId: context.workspaceId ?? null,
    mfaSatisfied: context.mfaSatisfied ?? false,
  })

  setSessionCookie(reply, issued.token, secure)
  return issued.token
}

export interface IssuedSession {
  token: string
  sessionId: string
}

export async function issueSession(
  db: Database,
  input: {
    userId: number
    ip?: string | null
    userAgent?: string | null
    workspaceId?: number | null
    mfaSatisfied?: boolean
  },
): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)

  const device = await db.query<{ id: string }>(
    `insert into devices (user_id, label, user_agent)
     values ($1, $2, $3)
     returning id`,
    [input.userId, deviceLabel(input.userAgent ?? undefined), input.userAgent ?? null],
  )

  // Workspace aktif ikut ditulis di sini, bukan hanya di pemanggilnya. Sesi
  // hasil putaran ulang (setelah MFA dan setelah ganti kata sandi) juga lewat
  // fungsi ini, dan sesi yang lahir tanpa workspace aktif membuat pengguna
  // diminta membuat usaha baru walaupun usahanya sudah ada.
  const session = await db.query<{ id: string }>(
    `insert into sessions
       (user_id, device_id, token_hash, ip, user_agent, mfa_satisfied_at, active_workspace_id, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8))
     returning id`,
    [
      input.userId,
      device.rows[0]?.id ?? null,
      tokenHash,
      input.ip ?? null,
      input.userAgent ?? null,
      input.mfaSatisfied ? new Date() : null,
      input.workspaceId ?? null,
      SESSION_TTL_DAYS,
    ],
  )

  return { token, sessionId: session.rows[0]!.id }
}

function deviceLabel(userAgent?: string): string {
  if (!userAgent) {
    return 'Perangkat tidak dikenal'
  }
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Peramban lain'
  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'sistem lain'
  return `${browser} di ${platform}`
}

/**
 * Muat sesi ke setiap permintaan. Token cookie yang tidak valid atau kedaluwarsa
 * diperlakukan sebagai tidak masuk, bukan sebagai galat, dan route publik tetap
 * bisa dijalankan.
 */
export function registerSessionLoader(app: FastifyInstance, db: Database, secureCookies: boolean) {
  app.decorateRequest('sessionUser', undefined)
  app.decorateRequest('workspaceRole', undefined)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) {
      return
    }

    const user = await loadSessionForToken(db, token)
    if (!user) {
      clearSessionCookie(reply, secureCookies)
      return
    }

    request.sessionUser = user

    await db.query('update sessions set last_seen_at = now(), last_ip = $1 where id = $2', [
      request.ip ?? null,
      user.sessionId,
    ])
  })
}

/** Melempar galat 401 dalam Bahasa Indonesia yang bisa ditampilkan di layar. */
export function requireSession(request: FastifyRequest): SessionUser {
  if (!request.sessionUser) {
    throw new AuthenticationError('Anda belum masuk.')
  }
  return request.sessionUser
}

export class AuthenticationError extends Error {
  readonly statusCode = 401
  readonly code = 'belum_masuk'

  constructor(message = 'Anda belum masuk.') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403
  readonly code: string

  constructor(message = 'Anda tidak punya izin untuk tindakan ini.', code = 'tidak_diizinkan') {
    super(message)
    this.name = 'AuthorizationError'
    this.code = code
  }
}

/**
 * Muat peran pengguna di workspace aktif. Peran dibaca dari database pada setiap
 * permintaan, jadi perubahan peran langsung berlaku tanpa perlu menerbitkan ulang
 * sesi (PRD 8).
 */
export async function loadWorkspaceRole(
  db: Database,
  request: FastifyRequest,
  requiredWorkspaceId?: number,
): Promise<{ workspaceId: number; role: Role; userId: number }> {
  const session = requireSession(request)
  const workspaceId = requiredWorkspaceId ?? session.workspaceId

  if (!workspaceId) {
    throw new AuthorizationError('Pilih workspace terlebih dahulu.')
  }

  // PRD 9: Owner dan Admin wajib memakai verifikasi dua langkah setelah 30
  // hari. Penegakan di sini, bukan di tampilan, karena setiap endpoint yang
  // menyentuh data workspace melewati fungsi ini.
  const gate = await loadMfaGate(db, session)
  if (gate.blocked) {
    throw new AuthorizationError(
      gate.enabled
        ? 'Masukkan kode verifikasi dua langkah lagi sebelum membuka data workspace.'
        : 'Aktifkan verifikasi dua langkah di pengaturan akun sebelum membuka data workspace.',
      'mfa_wajib_aktif',
    )
  }

  const result = await db.query<{ role: Role }>(
    `select role from memberships
      where workspace_id = $1 and user_id = $2 and removed_at is null`,
    [workspaceId, session.userId],
  )

  const row = result.rows[0]
  if (!row) {
    // Pesan sengaja tidak membedakan workspace tidak ada dan bukan anggota, supaya
    // ID workspace lain tidak bisa dipetakan lewat pesan galat (PRD 9).
    throw new AuthorizationError('Anda tidak punya akses ke workspace ini.')
  }

  request.workspaceRole = row.role
  return { workspaceId, role: row.role, userId: session.userId }
}

export { hashForLookup, hashToken, tokenMatches }
