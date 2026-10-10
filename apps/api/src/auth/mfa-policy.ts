import type { Sql } from '@sahabat/db'

/**
 * PRD 9: verifikasi dua langkah tersedia untuk semua pengguna dan diwajibkan
 * untuk Owner dan Admin pada 30 hari setelah akun dibuat.
 *
 * Aturan ini dihitung dari database pada setiap permintaan, bukan disimpan di
 * sesi, jadi penurunan peran atau pencabutan keanggotaan langsung mencabut
 * kewajiban tanpa perlu menerbitkan ulang sesi (PRD 8).
 */

/** Batas 30 hari dihitung dari tanggal akun dibuat, sama seperti bunyi PRD 9. */
export const MANDATORY_MFA_DAYS = 30

export interface MfaGate {
  /** Berlaku bila perannya Owner atau Admin dan 30 hari sudah lewat. */
  mandatory: boolean
  /** Verifikasi dua langkah sudah aktif di akun ini. */
  enabled: boolean
  /** Sesi ini belum boleh menyentuh data workspace. */
  blocked: boolean
}

interface AccountRow {
  created_at: Date
  privileged: boolean
  enabled: boolean
}

export async function loadMfaGate(
  db: Sql,
  input: { userId: number; mfaSatisfiedAt?: Date | null },
): Promise<MfaGate> {
  const result = await db.query<AccountRow>(
    `select u.created_at,
            exists (
              select 1 from memberships m
               where m.user_id = u.id
                 and m.removed_at is null
                 and m.role in ('owner', 'admin')
            ) as privileged,
            exists (
              select 1 from mfa_secrets s
               where s.user_id = u.id
                 and s.confirmed_at is not null
            ) as enabled
       from users u
      where u.id = $1
        and u.deleted_at is null`,
    [input.userId],
  )

  const account = result.rows[0]
  if (!account) {
    return { mandatory: false, enabled: false, blocked: false }
  }

  const deadline = account.created_at.getTime() + MANDATORY_MFA_DAYS * 86_400_000
  const mandatory = account.privileged && deadline <= Date.now()

  // Sesi lain milik pengguna yang sama tidak ikut menjadi terpenuhi ketika MFA
  // baru diaktifkan, jadi kode yang diberikan pada sesi berbeda tidak dihitung.
  const satisfied = account.enabled && (input.mfaSatisfiedAt ?? null) !== null

  return { mandatory, enabled: account.enabled, blocked: mandatory && !satisfied }
}
