import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Database } from '@sahabat/db'
import { requireSession } from './session.ts'
import { writeAudit } from './audit.ts'
import { hashToken, tokenMatches } from './token.ts'
import { loadMfaGate } from './mfa-policy.ts'
import {
  decryptSecret,
  encryptSecret,
  formatRecoveryCode,
  newMfaSecret,
  normalizeRecoveryCode,
  provisioningUri,
  verifyMfaToken,
} from './mfa.ts'
import type { FastifyInstance } from 'fastify'
import type { AuthDeps } from './routes.ts'

/**
 * PRD 9: MFA tersedia untuk semua pengguna dan diwajibkan untuk Owner dan Admin
 * pada 30 hari setelah akun dibuat.
 *
 * Rahasia disimpan terenkripsi dan hanya hash kode pemulihan yang disimpan, jadi
 * bocornya satu tidak memberi jalan masuk yang bisa langsung dipakai.
 *
 * Batas 30 hari dan cara menghitungnya ada di mfa-policy.ts, karena tegakannya
 * dipakai dua tempat: halaman status di sini dan penjaga setiap endpoint
 * workspace di session.ts.
 */

const RECOVERY_CODE_COUNT = 8
const RECOVERY_CODE_BYTES = 10
const PENDING_TTL_MINUTES = 10

export const mfaSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Kode berisi 6 angka.'),
})

export const mfaVerifySchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/, 'Kode berisi 6 angka.'),
  recoveryCode: z.string().trim().max(32).optional(),
})

export const mfaProofSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Kode berisi 6 angka.')
    .optional(),
  recoveryCode: z.string().trim().max(32).optional(),
})

function newRecoveryCode(): string {
  // Alfabet tanpa karakter yang mudah tertukar dengan huruf lain.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(RECOVERY_CODE_BYTES)
  let code = ''
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length]
  }
  return code
}

export function registerMfaRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps

  app.post('/api/auth/mfa/setup', async (request, reply) => {
    const session = requireSession(request)

    const existing = await db.query<{ confirmed_at: Date | null }>(
      'select confirmed_at from mfa_secrets where user_id = $1',
      [session.userId],
    )
    if (existing.rows[0]?.confirmed_at) {
      return reply.code(409).send({
        error: 'mfa_sudah_aktif',
        message: 'Verifikasi dua langkah sudah aktif di akun ini.',
      })
    }

    const secret = newMfaSecret()

    await db.query(
      `insert into mfa_secrets (user_id, secret_encrypted)
       values ($1, $2)
       on conflict (user_id) do update
         set secret_encrypted = excluded.secret_encrypted, confirmed_at = null`,
      [session.userId, encryptSecret(secret, deps.encryptionSecret)],
    )

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'mfa.setup_started',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({
      // Rahasia hanya dikirim ke perangkat pengguna yang sedang menyalakan MFA.
      // Setelah dikonfirmasi, halaman ini tidak pernah opened lagi.
      secret,
      uri: provisioningUri(secret, session.email),
      expiresInMinutes: PENDING_TTL_MINUTES,
    })
  })

  app.post('/api/auth/mfa/confirm', async (request, reply) => {
    const session = requireSession(request)
    const { token } = mfaSchema.parse(request.body)

    const row = await db.query<{ secret_encrypted: Buffer }>(
      'select secret_encrypted from mfa_secrets where user_id = $1 and confirmed_at is null',
      [session.userId],
    )
    const encrypted = row.rows[0]?.secret_encrypted
    if (!encrypted) {
      return reply.code(400).send({
        error: 'mfa_belum_dimulai',
        message: 'Mulai pengaturan verifikasi dua langkah lebih dulu.',
      })
    }

    const secret = decryptSecret(encrypted, deps.encryptionSecret)
    const result = await verifyMfaToken(secret, token)
    if (!result.valid) {
      return reply.code(400).send({
        error: 'kode_salah',
        message: 'Kode itu tidak cocok. Periksa jam perangkat Anda lalu coba lagi.',
      })
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode())

    await db.transaction(async (tx) => {
      await tx.query('update mfa_secrets set confirmed_at = now() where user_id = $1', [
        session.userId,
      ])
      await tx.query('delete from mfa_recovery_codes where user_id = $1', [session.userId])
      for (const [index, code] of codes.entries()) {
        await tx.query(
          `insert into mfa_recovery_codes (user_id, code_hash, label)
           values ($1, $2, $3)`,
          [session.userId, hashRecoveryCode(code), `Kode ${index + 1}`],
        )
      }
      // Sesi yang sedang berjalan ditandai sudah memenuhi MFA, jadi mengaktifkan
      // tidak memaksa keluar lalu masuk lagi.
      await tx.query('update sessions set mfa_satisfied_at = now() where id = $1', [
        session.sessionId,
      ])
    })

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'mfa.enabled',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { recoveryCodes: codes.length },
    })

    return reply.code(200).send({
      confirmed: true,
      // Kode pemulihan hanya ditampilkan sekali. Yang tersimpan adalah hash-nya.
      recoveryCodes: codes.map(formatRecoveryCode),
    })
  })

  app.post('/api/auth/mfa/disable', async (request, reply) => {
    const session = requireSession(request)
    const body = request.body as { token?: string; recoveryCode?: string }

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
    const token = typeof body?.token === 'string' ? body.token : ''
    const withToken = token ? await verifyMfaToken(secret, token) : { valid: false }

    let allowed = withToken.valid
    if (!allowed && body?.recoveryCode) {
      allowed = await consumeMfaRecoveryCode(db, session.userId, body.recoveryCode)
    }

    if (!allowed) {
      return reply.code(401).send({
        error: 'bukti_tidak_sah',
        message: 'Masukkan kode dari aplikasi autentikator atau kode pemulihan yang berlaku.',
      })
    }

    await db.transaction(async (tx) => {
      await tx.query('delete from mfa_secrets where user_id = $1', [session.userId])
      await tx.query('delete from mfa_recovery_codes where user_id = $1', [session.userId])
    })

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'mfa.disabled',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { usedRecoveryCode: !withToken.valid },
    })

    return reply.code(200).send({ disabled: true })
  })

  app.post('/api/auth/mfa/recovery-codes', async (request, reply) => {
    const session = requireSession(request)
    const { token, recoveryCode } = mfaProofSchema.parse(request.body)

    const row = await db.query<{ secret_encrypted: Uint8Array }>(
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

    // Membuat kode baru berarti kode lama tidak berlaku lagi, jadi diminta bukti
    // kepemilikan lebih dulu: kode dari aplikasi, atau kode pemulihan yang masih
    // belum dipakai. Tanpa itu, siapa pun yang punya sesi bisa mengganti kode.
    let proven = false
    if (token) {
      proven = (await verifyMfaToken(decryptSecret(encrypted, deps.encryptionSecret), token)).valid
    }
    if (!proven && recoveryCode) {
      proven = await consumeMfaRecoveryCode(db, session.userId, recoveryCode)
    }

    if (!proven) {
      return reply.code(401).send({
        error: 'bukti_tidak_sah',
        message: 'Masukkan kode dari aplikasi autentikator atau salah satu kode pemulihan yang berlaku.',
      })
    }

    const fresh = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode())

    await db.transaction(async (tx) => {
      await tx.query('delete from mfa_recovery_codes where user_id = $1', [session.userId])
      for (const [index, value] of fresh.entries()) {
        await tx.query(
          `insert into mfa_recovery_codes (user_id, code_hash, label)
           values ($1, $2, $3)`,
          [session.userId, hashRecoveryCode(value), `Kode ${index + 1}`],
        )
      }
      await tx.query('update sessions set mfa_satisfied_at = now() where id = $1', [
        session.sessionId,
      ])
    })

    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      action: 'mfa.recovery_codes_issued',
      objectType: 'user',
      objectId: String(session.userId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return reply.code(200).send({ recoveryCodes: fresh.map(formatRecoveryCode) })
  })

  app.get('/api/auth/mfa/status', async (request, reply) => {
    const session = requireSession(request)

    const gate = await loadMfaGate(db, session)

    return reply.code(200).send({
      enabled: gate.enabled,
      mandatory: gate.mandatory,
      // Sesi ini belum memberi kode, jadi masih ada langkah yang belum tuntas.
      satisfied: session.mfaSatisfiedAt !== null,
      // True berarti akun tidak bisa membuka data workspace sampai MFA aktif.
      blocked: gate.blocked,
    })
  })
}

function hashRecoveryCode(code: string): string {
  // Kode pemulihan hanya 5 karakter dari alfabet 32, jadi harus di-hash dengan
  // pekerjaan yang cukup mahal agar tidak bisa ditebak dari database.
  return hashToken(`recovery:${normalizeRecoveryCode(code)}`)
}

export async function consumeMfaRecoveryCode(
  db: Database,
  userId: number,
  presented: string,
): Promise<boolean> {
  const candidates = await db.query<{ id: number; code_hash: string }>(
    'select id, code_hash from mfa_recovery_codes where user_id = $1 and used_at is null',
    [userId],
  )

  for (const candidate of candidates.rows) {
    if (tokenMatches(candidate.code_hash, `recovery:${normalizeRecoveryCode(presented)}`)) {
      // Syarat used_at is null membuat kode hanya bisa ditukar sekali walau dua
      // permintaan datang bersamaan.
      const claimed = await db.query(
        'update mfa_recovery_codes set used_at = now() where id = $1 and used_at is null',
        [candidate.id],
      )
      return claimed.affected === 1
    }
  }

  return false
}
