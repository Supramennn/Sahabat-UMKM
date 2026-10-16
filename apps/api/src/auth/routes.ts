import { randomBytes } from 'node:crypto'
import type { Database, Sql } from '@sahabat/db'
import { hashForLookup, hashToken } from './token.ts'
import { checkPasswordPolicy, dummyPasswordHash, hashPassword, passwordMatchesAny } from './password.ts'
import { writeAudit } from './audit.ts'
import { ensurePlanCapacity } from '../plans/service.ts'
import { consumeMfaRecoveryCode, mfaVerifySchema } from './mfa-routes.ts'
import { decryptSecret, verifyMfaToken } from './mfa.ts'
import { loadMfaGate } from './mfa-policy.ts'
import {
  changeEmailSchema,
  changePasswordSchema,
  createWorkspaceSchema,
  forgotPasswordSchema,
  invitationSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateMembershipSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
  verifyEmailSchema,
  type CreateWorkspaceInput,
  type InvitationInput,
} from './schemas.ts'
import {
  AuthenticationError,
  AuthorizationError,
  issueSession,
  loadWorkspaceRole,
  requireSession,
  rotateSession,
  setSessionCookie,
} from './session.ts'
import { loadSessionForToken } from './session.ts'
import type { FastifyInstance } from 'fastify'
import { can, canAssignRole, type Role } from '@sahabat/shared'

/**
 * PRD 6.1 memuat daftar perangkat dan sesi aktif dengan tombol keluarkan dari
 * semua perangkat, jadi ini memakai label yang bisa dibaca pengguna.
 */
interface DeviceRow {
  id: string
  label: string
  user_agent: string | null
  last_seen_at: Date
  active_sessions: number
  current_session: boolean
}

/**
 * PRD 9: reset password memakai token acak, kedaluwarsa, sekali pakai, dan
 * responsnya tidak membuka apakah email terdaftar.
 */
const RESET_TOKEN_TTL_MINUTES = 60
const VERIFICATION_TOKEN_TTL_HOURS = 24
const INVITATION_TTL_DAYS = 14
/**
 * PRD 9: email verifikasi tidak boleh disimpan tanpa batas. Tanpa itu, siapa pun
 * bisa membuat email sekali dan meminta tautan tanpa henti.
 */
const VERIFICATION_RESEND_COOLDOWN_MINUTES = 10


/**
 * Daftar kata sandi yang sudah bocor. PRD 9 mewajibkan pemeriksaan ini. Daftar
 * lokal ini hanya berisi pola yang jelas tidak mungkin dipakai pengguna sungguhan,
 * sehingga pemeriksaan tidak bergantung pada layanan luar yang bisa gagal diam-diam.
 */
const OBVIOUSLY_COMPROMISED = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  '1234567890',
  'qwertyuiop',
  'qwertyuiop123',
  'iloveyou1',
  'admin1234',
  'welcome123',
  'sahabat123',
  'sahabatumkm',
  'passw0rd123',
  'letmein12345',
])

export function isObviouslyCompromised(plain: string): boolean {
  const normalized = plain.toLowerCase()
  if (OBVIOUSLY_COMPROMISED.has(normalized)) {
    return true
  }
  // Kata sandi yang hanya berisi satu karakter berulang.
  if (/^(.)\1+$/.test(normalized)) {
    return true
  }
  return false
}

function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length >= 3 ? base : `usaha-${Math.random().toString(36).slice(2, 8)}`
}

async function uniqueSlug(db: Sql, name: string): Promise<string> {
  const base = slugFromName(name)
  let candidate = base
  let suffix = 1

  for (;;) {
    const existing = await db.query('select 1 from workspaces where slug = $1 and deleted_at is null', [
      candidate,
    ])
    if (existing.rows.length === 0) {
      return candidate
    }
    suffix += 1
    candidate = `${base}-${suffix}`
  }
}

export interface AuthDeps {
  db: Database
  secureCookies: boolean
  /** Mengirim email. Fase 1 memakai penyedia log, tidak pernah gagal diam-diam. */
  sendEmail: (message: EmailMessage) => Promise<void>
  /**
   * Kunci enkripsi untuk rahasia MFA. PRD 9 mewajibkan enkripsi saat disimpan dan
   * melarang secret ada di repositori, jadi nilainya hanya dari environment.
   */
  encryptionSecret: string
  /**
   * Asal aplikasi web. Tautan di email menuju ke sini, bukan ke asal API, karena
   * yang dibuka pengguna adalah halaman, bukan endpoint.
   */
  webOrigin: string
}

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db, secureCookies } = deps

  app.post('/api/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body)

    if (isObviouslyCompromised(input.password)) {
      return reply.code(400).send({
        error: 'kata_sandi_lemah',
        message: 'Kata sandi ini terlalu umum. Pilih yang lain.',
      })
    }

    const policy = checkPasswordPolicy(input.password)
    if (!policy.ok) {
      return reply.code(400).send({ error: 'kata_sandi_lemah', problems: policy.problems })
    }

    const passwordHash = await hashPassword(input.password)
    const verificationToken = cryptoRandomToken()

    const user = await db.transaction(async (tx) => {
      const existing = await tx.query('select 1 from users where email = $1 and deleted_at is null', [
        input.email,
      ])
      if (existing.rows.length > 0) {
        return null
      }

      const created = await tx.query<{ id: number }>(
        `insert into users (email, password_hash, name)
         values ($1, $2, $3)
         returning id`,
        [input.email, passwordHash, input.name],
      )
      const userId = created.rows[0]!.id

      await tx.query(
        `insert into password_history (user_id, password_hash) values ($1, $2)`,
        [userId, passwordHash],
      )

      // Token disimpan bersama akunnya dalam satu transaksi. Kalau INSERT token
      // gagal, akunnya ikut batal, jadi tidak pernah ada akun tanpa jalan verifikasi.
      await tx.query(
        `insert into email_verification_tokens (user_id, token_hash, expires_at)
         values ($1, $2, now() + make_interval(hours => $3))`,
        [userId, hashToken(verificationToken), VERIFICATION_TOKEN_TTL_HOURS],
      )

      return { userId }
    })

    if (!user) {
      // Ini bukan bisnis: jawaban tetap sama supaya email terdaftar tidak
      // bisa dipetakan lewat pesan (PRD 9).
      return reply.code(202).send({
        message: 'Jika email itu bisa dipakai, kami mengirim tautan verifikasi.',
      })
    }

    await deps.sendEmail({
      to: input.email,
      subject: 'Verifikasi email Anda di Sahabat UMKM',
      body: `Buka tautan ini untuk memverifikasi email: ${deps.webOrigin}/verifikasi-email?token=${verificationToken}`,
    })

    await writeAudit(db, {
      actorUserId: user.userId,
      action: 'user.registered',
      objectType: 'user',
      objectId: String(user.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(201).send({
      userId: user.userId,
      message: 'Jika email itu bisa dipakai, kami mengirim tautan verifikasi.',
    })
  })

  /**
   * PRD 6.1: verifikasi email. Tanpa endpoint ini, akun yang baru mendaftar tidak
   * pernah bisa masuk karena masuk menolak email yang belum diverifikasi.
   *
   * Token hanya disimpan sebagai hash dan hanya bisa dipakai sekali, jadi tautan
   * yang bocor lewat log peramban atau riwayat email tidak cukup untuk membuka
   * akun (PRD 9).
   */
  app.post('/api/auth/verify-email', async (request, reply) => {
    const input = verifyEmailSchema.parse(request.body)

    const tokenHash = hashToken(input.token)
    const found = await db.query<{ id: string; user_id: number }>(
      `select id, user_id from email_verification_tokens
        where token_hash = $1 and consumed_at is null and expires_at > now()`,
      [tokenHash],
    )

    const matched = found.rows[0]
    if (!matched) {
      await writeAudit(db, {
        action: 'user.email_verification_failed',
        result: 'denied',
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.code(400).send({
        error: 'token_tidak_valid',
        message: 'Tautan itu sudah dipakai atau kedaluwarsa. Minta tautan baru di halaman masuk.',
      })
    }

    await db.transaction(async (tx) => {
      // Syarat consumed_at is null membuat tautan hanya berlaku sekali, walau
      // dua permintaan datang bersamaan.
      const claimed = await tx.query(
        'update email_verification_tokens set consumed_at = now() where id = $1 and consumed_at is null',
        [matched.id],
      )
      if (claimed.affected === 0) {
        throw new AuthenticationError('Tautan itu sudah dipakai atau kedaluwarsa.')
      }

      await tx.query(
        'update users set email_verified_at = now() where id = $1 and email_verified_at is null',
        [matched.user_id],
      )
    })

    await writeAudit(db, {
      actorUserId: matched.user_id,
      action: 'user.email_verified',
      objectType: 'user',
      objectId: String(matched.user_id),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({
      verified: true,
      message: 'Email terverifikasi. Silakan masuk.',
    })
  })

  /**
   * Mengirim ulang tautan verifikasi. Respons sama untuk email terdaftar,
   * belum terdaftar, dan sudah terverifikasi, supaya endpoint ini tidak bisa
   * dipakai memetakan email mana yang punya akun (PRD 9).
   */
  app.post('/api/auth/resend-verification', async (request, reply) => {
    const input = resendVerificationSchema.parse(request.body)
    const message = 'Jika email itu terdaftar dan belum terverifikasi, kami mengirim tautan baru.'

    await resendVerificationEmail(db, deps, input.email, request.ip ?? null)

    return reply.code(202).send({ message })
  })

  app.post('/api/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const ip = request.ip ?? null
    const userAgent = request.headers['user-agent'] ?? null

    const emailHash = hashForLookup(input.email)

    const blocked = await tooManyAttempts(db, emailHash, ip)
    if (blocked) {
      await writeAudit(db, {
        action: 'auth.login_blocked',
        result: 'denied',
        ip,
        userAgent,
        metadata: { emailHash },
      })
      return reply.code(429).send({
        error: 'terlalu_banyak_percobaan',
        message: 'Terlalu banyak percobaan masuk. Coba lagi nanti.',
      })
    }

    const found = await db.query<{
      id: number
      password_hash: string
      email_verified_at: Date | null
      mfa_required_at: Date | null
    }>('select id, password_hash, email_verified_at, mfa_required_at from users where email = $1 and deleted_at is null', [
      input.email,
    ])

    const user = found.rows[0]

    // Tetap jalankan verifikasi meski email tidak ada, supaya waktu respons tidak
    // membedakan email terdaftar dan tidak (PRD 9). Hash penutupnya harus hash
    // Argon2id yang sungguhan: string yang gagal diurai akan selesai seketika dan
    // justru membuka celah pemetaan email lewat perbedaan lama respons.
    const storedHash = user?.password_hash ?? (await dummyPasswordHash())
    const matchedIndex = await passwordMatchesAny([storedHash], input.password)
    // passwordMatchesAny mengembalikan indeks, jadi 0 berarti hash pertama cocok.
    // `matchedIndex` tidak boleh dipakai langsung sebagai boolean, karena 0
    // bernilai falsy dan akan membuat login yang berhasil dianggap gagal.
    const passwordOk = matchedIndex !== -1

    await db.query(
      `insert into login_attempts (email_hash, ip, successful, user_agent)
       values ($1, $2, $3, $4)`,
      [emailHash, ip, Boolean(user && passwordOk), userAgent],
    )

    if (!user || !passwordOk) {
      await writeAudit(db, {
        action: 'auth.login_failed',
        result: 'denied',
        ip,
        userAgent,
        metadata: { emailHash },
      })
      return reply.code(401).send({
        error: 'kredensial_salah',
        message: 'Email atau kata sandi salah.',
      })
    }

    if (!user.email_verified_at) {
      return reply.code(403).send({
        error: 'email_belum_diverifikasi',
        message: 'Verifikasi email Anda dulu sebelum masuk.',
      })
    }

    // Kalau pengguna sudah mengaktifkan verifikasi dua langkah, langkah kedua
    // selalu diminta. Kolom mfa_required_at hanya menandai tenggat kewajiban 30
    // hari, jadi menghilangkannya dari kondisi ini berarti MFA yang sudah aktif
    // tetap dilewati setiap kali masuk.
    const hasMfa = await db.query(
      'select 1 from mfa_secrets where user_id = $1 and confirmed_at is not null',
      [user.id],
    )
    const needsMfaStep = hasMfa.rows.length > 0

    if (needsMfaStep) {
      // Sesi terbit tetapi belum memenuhi MFA, jadi tidak bisa menyentuh data
      // workspace sebelum kode kedua diberikan.
      const issued = await issueSession(db, {
        userId: user.id,
        ip,
        userAgent,
        mfaSatisfied: false,
      })
      setSessionCookie(reply, issued.token, secureCookies)
      return reply.code(200).send({
        mfaRequired: true,
      })
    }

    const membership = await db.query<{ workspace_id: number }>(
      `select workspace_id from memberships
        where user_id = $1 and removed_at is null
        order by joined_at asc limit 1`,
      [user.id],
    )
    const workspaceId = input.workspaceId ?? membership.rows[0]?.workspace_id ?? null

    if (input.workspaceId) {
      const allowed = await db.query(
        'select 1 from memberships where workspace_id = $1 and user_id = $2 and removed_at is null',
        [input.workspaceId, user.id],
      )
      if (allowed.rows.length === 0) {
        return reply.code(403).send({
          error: 'tidak_diizinkan',
          message: 'Anda tidak punya akses ke workspace ini.',
        })
      }
    }

    const issued = await issueSession(db, {
      userId: user.id,
      ip,
      userAgent,
      workspaceId,
      mfaSatisfied: !needsMfaStep,
    })

    // issueSession tidak menulis active_workspace_id, jadi harus diisi di sini.
    // Tanpa itu sesi masuk tidak punya workspace aktif dan setiap endpoint
    // workspace akan meminta pengguna memilih workspace lebih dulu.
    await db.query(
      `update sessions set active_workspace_id = $1 where id = $2`,
      [workspaceId, issued.sessionId],
    )

    setSessionCookie(reply, issued.token, secureCookies)

    await writeAudit(db, {
      workspaceId,
      actorUserId: user.id,
      action: 'auth.login',
      objectType: 'session',
      objectId: issued.sessionId,
      ip,
      userAgent,
    })

    // PRD 9: Owner dan Admin wajib MFA setelah 30 hari. Sesi tetap terbit karena
    // pengaturan akun tidak butuh izin workspace, tapi endpoint workspace menolak
    // sampai MFA aktif, jadi flag ini hanya memberi tahu halaman tujuan masuk.
    const gate = await loadMfaGate(db, { userId: user.id, mfaSatisfiedAt: new Date() })

    return reply.code(200).send({
      userId: user.id,
      workspaceId,
      mfaRequired: false,
      mfaSatisfied: !needsMfaStep,
      mfaSetupRequired: gate.blocked,
    })
  })

  app.post('/api/auth/mfa/verify', async (request, reply) => {
    const input = mfaVerifySchema.parse(request.body)

    const token = request.cookies.sahabat_session
    if (!token) {
      return reply.code(401).send({ error: 'belum_masuk', message: 'Sesi tidak berlaku.' })
    }

    const session = await loadSessionForToken(db, token)
    if (!session) {
      return reply.code(401).send({ error: 'belum_masuk', message: 'Sesi tidak berlaku.' })
    }

    const row = await db.query<{ secret_encrypted: Buffer }>(
      'select secret_encrypted from mfa_secrets where user_id = $1 and confirmed_at is not null',
      [session.userId],
    )
    const encrypted = row.rows[0]?.secret_encrypted
    if (!encrypted) {
      return reply.code(409).send({
        error: 'mfa_tidak_aktif',
        message: 'Verifikasi dua langkah belum aktif di akun ini.',
      })
    }

    const secret = decryptSecret(encrypted, deps.encryptionSecret)
    const result = await verifyMfaToken(secret, input.token)

    if (!result.valid && !input.recoveryCode) {
      await writeAudit(db, {
        actorUserId: session.userId,
        action: 'mfa.verify_failed',
        result: 'denied',
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.code(401).send({
        error: 'kode_salah',
        message: 'Kode itu tidak cocok. Periksa jam perangkat Anda lalu coba lagi.',
      })
    }

    if (!result.valid && input.recoveryCode) {
      const used = await consumeMfaRecoveryCode(db, session.userId, input.recoveryCode)
      if (!used) {
        return reply.code(401).send({
          error: 'kode_pemulihan_salah',
          message: 'Kode pemulihan itu tidak berlaku atau sudah dipakai.',
        })
      }
    }

    await db.query('update sessions set mfa_satisfied_at = now() where id = $1', [session.sessionId])

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'mfa.verified',
      objectType: 'session',
      objectId: session.sessionId,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { usedRecoveryCode: !result.valid },
    })

    // Sesi diputar ulang setelah MFA, supaya token yang sempat ada sebelum kode
    // diberikan tidak lagi berlaku (PRD 9).
    const workspaceId =
      session.workspaceId ??
      (
        await db.query<{ workspace_id: number }>(
          'select workspace_id from memberships where user_id = $1 and removed_at is null order by joined_at asc limit 1',
          [session.userId],
        )
      ).rows[0]?.workspace_id ??
      null

    await rotateSession(
      db,
      token,
      reply,
      {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
        workspaceId,
        mfaSatisfied: true,
      },
      secureCookies,
    )

    return reply.code(200).send({ verified: true, workspaceId })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies.sahabat_session
    if (token) {
      await db.query('update sessions set revoked_at = now() where token_hash = $1', [hashToken(token)])
    }
    reply.clearCookie('sahabat_session', { path: '/' })
    return reply.code(204).send()
  })

  app.post('/api/auth/forgot-password', async (request, reply) => {
    const input = forgotPasswordSchema.parse(request.body)
    await requestPasswordReset(
      db,
      deps,
      input.email,
      request.ip ?? null,
      request.headers['user-agent'] ?? null,
    )

    // Respons identik baik email terdaftar maupun tidak (PRD 9).
    return reply.code(202).send({
      message: 'Jika email itu terdaftar, kami mengirim tautan atur ulang kata sandi.',
    })
  })

  app.post('/api/auth/reset-password', async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body)

    if (isObviouslyCompromised(input.password)) {
      return reply.code(400).send({
        error: 'kata_sandi_lemah',
        message: 'Kata sandi ini terlalu umum. Pilih yang lain.',
      })
    }

    const policy = checkPasswordPolicy(input.password)
    if (!policy.ok) {
      return reply.code(400).send({ error: 'kata_sandi_lemah', problems: policy.problems })
    }

    // Token disimpan sebagai hash SHA-256 yang deterministik, jadi pencarian bisa
    // lewat indeks. Memindai semua token aktif akan membaca seluruh tabel pada
    // endpoint publik setiap kali ada permintaan.
    const found = await db.query<{ id: string; user_id: number }>(
      `select id, user_id from password_reset_tokens
        where token_hash = $1 and consumed_at is null and expires_at > now()`,
      [hashToken(input.token)],
    )

    const matchedRow = found.rows[0]
    if (!matchedRow) {
      return reply.code(400).send({
        error: 'token_tidak_valid',
        message: 'Tautan tidak berlaku atau sudah dipakai.',
      })
    }
    const matched = { userId: matchedRow.user_id, tokenId: String(matchedRow.id) }

    const passwordHash = await hashPassword(input.password)

    await db.transaction(async (tx) => {
      const consumed = await tx.query(
        'update password_reset_tokens set consumed_at = now() where id = $1 and consumed_at is null',
        [matched.tokenId],
      )
      if (consumed.affected === 0) {
        throw new AuthenticationError('Tautan tidak berlaku atau sudah dipakai.')
      }

      await tx.query('update users set password_hash = $1 where id = $2', [passwordHash, matched.userId])
      await tx.query('insert into password_history (user_id, password_hash) values ($1, $2)', [
        matched.userId,
        passwordHash,
      ])
      // Semua sesi dicabut, jadi kata sandi yang bocor tidak lagi berguna.
      await tx.query('update sessions set revoked_at = now() where user_id = $1', [matched.userId])
    })

    await writeAudit(db, {
      actorUserId: matched.userId,
      action: 'auth.password_reset',
      objectType: 'user',
      objectId: String(matched.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ message: 'Kata sandi sudah diperbarui. Silakan masuk.' })
  })

  app.post('/api/auth/change-password', async (request, reply) => {
    const session = requireSession(request)
    const input = changePasswordSchema.parse(request.body)

    const current = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [session.userId],
    )
    const currentHash = current.rows[0]?.password_hash ?? (await dummyPasswordHash())
    // passwordMatchesAny mengembalikan indeks, jadi 0 berarti cocok. Nilai 0
    // bernilai falsy, jadi tidak boleh dipakai langsung sebagai kondisi.
    if ((await passwordMatchesAny([currentHash], input.currentPassword)) === -1) {
      return reply.code(401).send({
        error: 'kredensial_salah',
        message: 'Kata sandi lama salah.',
      })
    }

    const policy = checkPasswordPolicy(input.newPassword)
    if (!policy.ok) {
      return reply.code(400).send({ error: 'kata_sandi_lemah', problems: policy.problems })
    }

    const history = await db.query<{ password_hash: string }>(
      'select password_hash from password_history where user_id = $1 order by created_at desc limit 5',
      [session.userId],
    )
    const reused = await passwordMatchesAny(
      history.rows.map((row) => row.password_hash),
      input.newPassword,
    )
    if (reused !== -1) {
      return reply.code(400).send({
        error: 'kata_sandi_dipakai',
        message: 'Kata sandi ini pernah dipakai. Pilih yang lain.',
      })
    }

    const newHash = await hashPassword(input.newPassword)
    await db.transaction(async (tx) => {
      await tx.query('update users set password_hash = $1 where id = $2', [newHash, session.userId])
      await tx.query('insert into password_history (user_id, password_hash) values ($1, $2)', [
        session.userId,
        newHash,
      ])
      // Sesi lain dicabut, sesi saat ini dirotasi (PRD 9).
      await tx.query('update sessions set revoked_at = now() where user_id = $1 and id <> $2', [
        session.userId,
        session.sessionId,
      ])
    })

    const token = request.cookies.sahabat_session
    if (token) {
      await rotateSession(
        db,
        token,
        reply,
        {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
        workspaceId: session.workspaceId,
      },
        secureCookies,
      )
    }

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      actorRole: request.workspaceRole ?? null,
      action: 'auth.password_changed',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ message: 'Kata sandi sudah diperbarui.' })
  })

  app.post('/api/auth/change-email', async (request, reply) => {
    const session = requireSession(request)
    const input = changeEmailSchema.parse(request.body)

    const current = await db.query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [session.userId],
    )
    const currentHash = current.rows[0]?.password_hash ?? (await dummyPasswordHash())
    if ((await passwordMatchesAny([currentHash], input.currentPassword)) === -1) {
      return reply.code(401).send({ error: 'kredensial_salah', message: 'Kata sandi salah.' })
    }

    const taken = await db.query('select 1 from users where email = $1 and deleted_at is null', [
      input.newEmail,
    ])
    if (taken.rows.length > 0) {
      return reply.code(409).send({
        error: 'email_tdipakai',
        message: 'Email itu sudah dipakai akun lain.',
      })
    }

    await db.query('update users set email = $1 where id = $2', [input.newEmail, session.userId])

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'auth.email_changed',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ message: 'Email sudah diperbarui.' })
  })

  app.patch('/api/auth/profile', async (request, reply) => {
    const session = requireSession(request)
    const input = updateProfileSchema.parse(request.body)

    await db.query('update users set name = $1 where id = $2', [input.name, session.userId])

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'user.name_changed',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ message: 'Nama sudah diperbarui.' })
  })

  app.get('/api/auth/session', async (request, reply) => {
    if (!request.sessionUser) {
      return reply.code(401).send({ error: 'belum_masuk', message: 'Anda belum masuk.' })
    }
    const session = request.sessionUser

    const workspaces = await db.query<{ id: number; name: string; slug: string; role: Role }>(
      `select w.id, w.name, w.slug, m.role
         from memberships m
         join workspaces w on w.id = m.workspace_id
        where m.user_id = $1 and m.removed_at is null and w.deleted_at is null
        order by m.joined_at asc`,
      [session.userId],
    )

    return reply.code(200).send({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        emailVerified: session.emailVerified,
        mfaRequiredAt: session.mfaRequiredAt,
      },
      activeWorkspaceId: session.workspaceId,
      workspaces: workspaces.rows,
      mfaSatisfied: session.mfaSatisfiedAt !== null,
    })
  })

  app.post('/api/auth/switch-workspace', async (request, reply) => {
    const session = requireSession(request)
    const body = request.body as { workspaceId?: number }
    const workspaceId = Number(body?.workspaceId)

    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      return reply.code(400).send({
        error: 'data_tidak_valid',
        message: 'Pilih workspace yang valid.',
      })
    }

    // Keanggotaan diperiksa langsung, jadi ID workspace milik orang lain tidak
    // bisa dipakai hanya karena dikirim di badan permintaan (PRD 9).
    const membership = await db.query(
      `select 1 from memberships
        where workspace_id = $1 and user_id = $2 and removed_at is null`,
      [workspaceId, session.userId],
    )
    if (membership.rows.length === 0) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Anda tidak punya akses ke workspace ini.',
      })
    }

    await db.query('update sessions set active_workspace_id = $1 where id = $2', [
      workspaceId,
      session.sessionId,
    ])

    await writeAudit(db, {
      workspaceId,
      actorUserId: session.userId,
      action: 'workspace.switched',
      objectType: 'workspace',
      objectId: String(workspaceId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ workspaceId })
  })

  app.get('/api/auth/devices', async (request, reply) => {
    const session = requireSession(request)

    const devices = await db.query<DeviceRow>(
      `select d.id, d.label, d.user_agent, d.last_seen_at,
              count(s.id)::int as active_sessions,
              bool_or(s.id = $2) as current_session
         from devices d
         join sessions s on s.device_id = d.id and s.revoked_at is null
        where d.user_id = $1
        group by d.id, d.label, d.user_agent, d.last_seen_at
        order by d.last_seen_at desc`,
      [session.userId, session.sessionId],
    )

    return reply.code(200).send({ devices: devices.rows })
  })

  app.post('/api/auth/devices/revoke-others', async (request, reply) => {
    const session = requireSession(request)

    const result = await db.query(
      'update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null',
      [session.userId, session.sessionId],
    )

    await writeAudit(db, {
      actorUserId: session.userId,
      action: 'auth.devices_revoked',
      objectType: 'user',
      objectId: String(session.userId),
      metadata: { revokedSessions: result.affected },
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ revoked: result.affected })
  })

  app.post('/api/workspaces', async (request, reply) => {
    const session = requireSession(request)
    const input = createWorkspaceSchema.parse(request.body) as CreateWorkspaceInput

    const created = await db.transaction(async (tx) => {
      const slug = await uniqueSlug(tx, input.name)

      const workspace = await tx.query<{ id: number }>(
        `insert into workspaces (slug, name, business_type, timezone, owner_id)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [slug, input.name, input.businessType ?? null, input.timezone, session.userId],
      )
      const workspaceId = workspace.rows[0]!.id

      await tx.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
      await tx.query(
        'insert into workspace_subscriptions (workspace_id) values ($1) on conflict (workspace_id) do nothing',
        [workspaceId],
      )
      await tx.query(
        `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`,
        [workspaceId, session.userId],
      )

      return workspaceId
    })

    await db.query('update sessions set active_workspace_id = $1 where id = $2', [
      created,
      session.sessionId,
    ])

    await writeAudit(db, {
      workspaceId: created,
      actorUserId: session.userId,
      action: 'workspace.created',
      objectType: 'workspace',
      objectId: String(created),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(201).send({ workspaceId: created })
  })

  app.get('/api/workspaces/:workspaceId', async (request, reply) => {
    requireSession(request)
    const { workspaceId } = request.params as { workspaceId: string }

    const { workspaceId: id, role } = await loadWorkspaceRole(db, request, Number(workspaceId))

    const workspace = await db.query<{
      id: number
      name: string
      slug: string
      business_type: string | null
      timezone: string
      currency: string
      status: string
      created_at: Date
    }>(
      `select id, name, slug, business_type, timezone, currency, status, created_at
         from workspaces where id = $1`,
      [id],
    )

    const row = workspace.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Workspace tidak ditemukan.' })
    }

    const settings = await db.query<{ approval_required: boolean; approval_threshold_amount: string | null }>(
      'select approval_required, approval_threshold_amount from workspace_settings where workspace_id = $1',
      [id],
    )

    return reply.code(200).send({
      workspace: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        businessType: row.business_type,
        timezone: row.timezone,
        currency: row.currency,
        status: row.status,
        createdAt: row.created_at,
      },
      role,
      settings: {
        approvalRequired: settings.rows[0]?.approval_required ?? false,
        approvalThresholdAmount: settings.rows[0]?.approval_threshold_amount ?? null,
      },
    })
  })

  app.patch('/api/workspaces/:workspaceId', async (request, reply) => {
    const session = requireSession(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const input = updateWorkspaceSchema.parse(request.body) as Record<string, unknown>

    const { workspaceId: id } = await loadWorkspaceRole(db, request, Number(workspaceId))

    if (!can(roleFor(request), 'products.manage')) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Hanya Owner dan Admin yang bisa mengubah profil usaha.',
      })
    }

    await db.query(
      `update workspaces
          set name = coalesce($2, name),
              business_type = case when $3 then $4 else business_type end,
              timezone = coalesce($5, timezone),
              logo_key = case when $6 then $7 else logo_key end
        where id = $1`,
      [
        id,
        (input.name as string | undefined) ?? null,
        input.businessType !== undefined,
        (input.businessType as string | null | undefined) ?? null,
        (input.timezone as string | undefined) ?? null,
        input.logoKey !== undefined,
        (input.logoKey as string | null | undefined) ?? null,
      ],
    )

    await writeAudit(db, {
      workspaceId: id,
      actorUserId: session.userId,
      actorRole: request.workspaceRole ?? null,
      action: 'workspace.profile_updated',
      objectType: 'workspace',
      objectId: String(id),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ message: 'Profil usaha sudah diperbarui.' })
  })

  app.get('/api/workspaces/:workspaceId/members', async (request, reply) => {
    requireSession(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const { workspaceId: id } = await loadWorkspaceRole(db, request, Number(workspaceId))

    const members = await db.query<{
      id: number
      user_id: number
      name: string
      email: string
      role: Role
      joined_at: Date
      removed_at: Date | null
    }>(
      `select m.id, m.user_id, u.name, u.email, m.role, m.joined_at, m.removed_at
         from memberships m
         join users u on u.id = m.user_id
        where m.workspace_id = $1 and m.removed_at is null
        order by m.joined_at asc`,
      [id],
    )

    return reply.code(200).send({ members: members.rows })
  })

  app.post('/api/workspaces/:workspaceId/invitations', async (request, reply) => {
    const session = requireSession(request)
    const { workspaceId } = request.params as { workspaceId: string }
    const input = invitationSchema.parse(request.body) as InvitationInput

    const { workspaceId: id, role: actorRole } = await loadWorkspaceRole(db, request, Number(workspaceId))

    if (!canAssignRole(actorRole, input.role)) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Peran itu tidak bisa Anda berikan.',
      })
    }

    const rawToken = cryptoRandomToken()

    await db.transaction(async (tx) => {
      await ensurePlanCapacity(tx, id, 'anggota')
      await tx.query(
        `insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))`,
        [id, input.email, input.role, hashToken(rawToken), session.userId, INVITATION_TTL_DAYS],
      )
    })

    await deps.sendEmail({
      to: input.email,
      subject: 'Anda diundang ke workspace Sahabat UMKM',
      body: `Token undangan: ${rawToken}`,
    })

    await writeAudit(db, {
      workspaceId: id,
      actorUserId: session.userId,
      actorRole: actorRole,
      action: 'invitation.created',
      objectType: 'invitation',
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { role: input.role, email: input.email },
    })

    return reply.code(201).send({
      message: `Undangan terkirim ke ${input.email}. Tautan berlaku ${INVITATION_TTL_DAYS} hari.`,
    })
  })

  app.post('/api/invitations/accept', async (request, reply) => {
    const session = requireSession(request)
    const body = request.body as { token?: string }
    const token = body?.token ?? ''

    const candidates = await db.query<{
      id: string
      workspace_id: number
      email: string
      role: Role
    }>(
      `select id, workspace_id, email, role
         from workspace_invitations
        where token_hash = $1
          and accepted_at is null
          and revoked_at is null
          and expires_at > now()`,
      [hashToken(token)],
    )

    const matchedRow = candidates.rows[0]
    if (!matchedRow) {
      return reply.code(400).send({
        error: 'token_tidak_valid',
        message: 'Undangan tidak berlaku atau sudah dipakai.',
      })
    }
    const matched = {
      id: matchedRow.id,
      workspaceId: matchedRow.workspace_id,
      email: matchedRow.email,
      role: matchedRow.role,
    }

    if (matched.email !== session.email) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Undangan ini ditujukan untuk email lain.',
      })
    }

    await db.transaction(async (tx) => {
      const claimed = await tx.query(
        'update workspace_invitations set accepted_at = now() where id = $1 and accepted_at is null',
        [matched.id],
      )
      if (claimed.affected === 0) {
        throw new AuthorizationError('Undangan tidak berlaku atau sudah dipakai.')
      }

      await ensurePlanCapacity(tx, matched.workspaceId, 'anggota')

      await tx.query(
        `insert into memberships (workspace_id, user_id, role, invited_by)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [matched.workspaceId, session.userId, matched.role, session.userId],
      )
    })

    await writeAudit(db, {
      workspaceId: matched.workspaceId,
      actorUserId: session.userId,
      actorRole: matched.role,
      action: 'invitation.accepted',
      objectType: 'workspace',
      objectId: String(matched.workspaceId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ workspaceId: matched.workspaceId, role: matched.role })
  })

  app.patch('/api/workspaces/:workspaceId/members/:memberId', async (request, reply) => {
    const session = requireSession(request)
    const { workspaceId, memberId } = request.params as { workspaceId: string; memberId: string }
    const input = updateMembershipSchema.parse(request.body)

    const { workspaceId: id, role: actorRole } = await loadWorkspaceRole(db, request, Number(workspaceId))

    if (!canAssignRole(actorRole, input.role)) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Peran itu tidak bisa Anda berikan.',
      })
    }

    // Batas workspace_id ikut dikueri, jadi anggota workspace lain tidak bisa
    // diubah lewat memberId saja (PRD 9).
    const target = await db.query<{ id: number; role: Role; user_id: number }>(
      `select id, role, user_id from memberships
        where id = $1 and workspace_id = $2 and removed_at is null`,
      [Number(memberId), id],
    )
    const row = target.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Anggota tidak ditemukan.' })
    }
    if (row.role === 'owner') {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Peran Owner tidak bisa diubah di sini.',
      })
    }

    await db.query('update memberships set role = $1 where id = $2 and workspace_id = $3', [
      input.role,
      Number(memberId),
      id,
    ])

    await writeAudit(db, {
      workspaceId: id,
      actorUserId: session.userId,
      actorRole: actorRole,
      action: 'membership.role_changed',
      objectType: 'membership',
      objectId: String(memberId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { from: row.role, to: input.role },
    })

    return reply.code(200).send({ message: 'Peran anggota sudah diperbarui.' })
  })

  app.delete('/api/workspaces/:workspaceId/members/:memberId', async (request, reply) => {
    const session = requireSession(request)
    const { workspaceId, memberId } = request.params as { workspaceId: string; memberId: string }

    const { workspaceId: id, role: actorRole } = await loadWorkspaceRole(db, request, Number(workspaceId))

    if (!canAssignRole(actorRole, 'staff')) {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Anda tidak bisa mengeluarkan anggota.',
      })
    }

    const target = await db.query<{ id: number; role: Role; user_id: number }>(
      `select id, role, user_id from memberships
        where id = $1 and workspace_id = $2 and removed_at is null`,
      [Number(memberId), id],
    )
    const row = target.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Anggota tidak ditemukan.' })
    }
    if (row.role === 'owner') {
      return reply.code(403).send({
        error: 'tidak_diizinkan',
        message: 'Peran Owner tidak bisa dikosongkan.',
      })
    }

    await db.query(
      'update memberships set removed_at = now() where id = $1 and workspace_id = $2',
      [Number(memberId), id],
    )

    await writeAudit(db, {
      workspaceId: id,
      actorUserId: session.userId,
      actorRole: actorRole,
      action: 'membership.removed',
      objectType: 'membership',
      objectId: String(memberId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(204).send()
  })
}

function roleFor(request: { workspaceRole?: Role }): Role {
  return request.workspaceRole ?? 'viewer'
}

async function tooManyAttempts(
  db: Database,
  emailHash: string,
  ip: string | null,
): Promise<boolean> {
  const windowMinutes = 15
  const limit = 5

  const byAccount = await db.query<{ count: number }>(
    `select count(*)::int as count from login_attempts
      where email_hash = $1 and successful = false and created_at > now() - make_interval(mins => $2)`,
    [emailHash, windowMinutes],
  )
  if ((byAccount.rows[0]?.count ?? 0) >= limit) {
    return true
  }

  if (ip) {
    const byIp = await db.query<{ count: number }>(
      `select count(*)::int as count from login_attempts
        where ip = $1 and successful = false and created_at > now() - make_interval(mins => $2)`,
      [ip, windowMinutes],
    )
    if ((byIp.rows[0]?.count ?? 0) >= limit * 4) {
      return true
    }
  }

  return false
}

async function requestPasswordReset(
  db: Database,
  deps: AuthDeps,
  email: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  const user = await db.query<{ id: number }>(
    'select id from users where email = $1 and deleted_at is null',
    [email],
  )
  const userId = user.rows[0]?.id
  if (userId === undefined) {
    return
  }

  const rawToken = cryptoRandomToken()
  await db.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at, created_ip)
     values ($1, $2, now() + make_interval(mins => $3), $4)`,
    [userId, hashToken(rawToken), RESET_TOKEN_TTL_MINUTES, ip ?? null],
  )

  await deps.sendEmail({
    to: email,
    subject: 'Atur ulang kata sandi Sahabat UMKM',
    body: `Buka tautan ini untuk membuat kata sandi baru: ${deps.webOrigin}/atur-ulang-kata-sandi?token=${rawToken}`,
  })

  await writeAudit(db, {
    actorUserId: userId,
    action: 'auth.password_reset_requested',
    objectType: 'user',
    objectId: String(userId),
    ip,
    userAgent,
  })
}

/**
 * Kirim ulang tautan verifikasi. Token lama dicabut supaya hanya satu tautan
 * yang berlaku, dan permintaan beruntun dibatasi supaya alamat email orang lain
 * tidak bisa dipakai membanjiri kotak masuk (PRD 9).
 */
async function resendVerificationEmail(
  db: Database,
  deps: AuthDeps,
  email: string,
  ip: string | null,
): Promise<void> {
  const user = await db.query<{ id: number }>(
    `select id from users
      where email = $1 and deleted_at is null and email_verified_at is null`,
    [email],
  )
  const userId = user.rows[0]?.id
  if (userId === undefined) {
    return
  }

  const recent = await db.query<{ count: number }>(
    `select count(*)::int as count from email_verification_tokens
      where user_id = $1
        and created_at > now() - make_interval(mins => $2)`,
    [userId, VERIFICATION_RESEND_COOLDOWN_MINUTES],
  )
  if ((recent.rows[0]?.count ?? 0) > 0) {
    return
  }

  const token = cryptoRandomToken()

  await db.transaction(async (tx) => {
    await tx.query(
      'update email_verification_tokens set consumed_at = now() where user_id = $1 and consumed_at is null',
      [userId],
    )
    await tx.query(
      `insert into email_verification_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() + make_interval(hours => $3))`,
      [userId, hashToken(token), VERIFICATION_TOKEN_TTL_HOURS],
    )
  })

  await deps.sendEmail({
    to: email,
    subject: 'Verifikasi email Anda di Sahabat UMKM',
    body: `Buka tautan ini untuk memverifikasi email: ${deps.webOrigin}/verifikasi-email?token=${token}`,
  })

  await writeAudit(db, {
    actorUserId: userId,
    action: 'user.verification_resent',
    objectType: 'user',
    objectId: String(userId),
    ip,
  })
}

function cryptoRandomToken(): string {
  return randomBytes(32).toString('base64url')
}
