import type { Sql } from '@sahabat/db'

/**
 * Audit log. PRD 9: mencatat pelaku, workspace, waktu, tindakan, objek, dan hasil,
 * tanpa password atau token.
 */

export type AuditResult = 'success' | 'denied' | 'failure'

export interface AuditEntry {
  workspaceId?: number | null
  actorUserId?: number | null
  actorRole?: string | null
  action: string
  objectType?: string | null
  objectId?: string | null
  result?: AuditResult
  // Header HTTP selalu mungkin undefined. exactOptionalPropertyTypes melarang
  // `string | undefined` pada properti opsional, jadi nilainya dinormalkan di sini.
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'passwordhash']

/**
 * Buang kunci yang berisi kata sandi atau token sebelum metadata ditulis. Ini
 * belt-and-braces: pemanggil tidak seharusnya mengirim nilai itu, tapi satu
 * penyaring di satu tempat lebih dapat diandalkan daripada setiap pemanggil
 * benar-benar ingat.
 */
export function scrubMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      output[key] = '[dihilangkan]'
      continue
    }
    if (value instanceof Date) {
      output[key] = value.toISOString()
      continue
    }
    output[key] = value
  }
  return output
}

export async function writeAudit(db: Sql, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs
       (workspace_id, actor_user_id, actor_role, action, object_type, object_id, result, ip, user_agent, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.workspaceId ?? null,
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.objectType ?? null,
      entry.objectId ?? null,
      entry.result ?? 'success',
      entry.ip ?? null,
      entry.userAgent ?? null,
      JSON.stringify(scrubMetadata(entry.metadata ?? {})),
    ],
  )
}
