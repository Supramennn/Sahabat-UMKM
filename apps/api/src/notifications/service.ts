import type { Database, Sql } from '@sahabat/db'
import { notificationKinds, type NotificationKind } from '@sahabat/shared'
import type { EmailMessage } from '../auth/routes.ts'

/**
 * Inti notifikasi PRD 6.9.
 *
 * Baris notifikasi ditulis di dalam transaksi peristiwanya: stok rendah di
 * `recordMovement`, keputusan PO di route purchasing, undangan di route
 * undangan, dan aktivitas keamanan di route akun. Email tidak dikirim dari
 * dalam transaksi itu. Setiap baris membawa penanda `emailed_at`, dan pengirim
 * (`flushNotificationEmails`) mengambil baris yang belum terkirim. Dengan
 * begitu email tidak pernah terkirim untuk transaksi yang gagal, dan kegagalan
 * pengiriman email tidak pernah membatalkan transaksi bisnis.
 */

export interface NotificationInput {
  workspaceId: number | null
  userId: number
  kind: NotificationKind
  title: string
  body: string
  href?: string | null
  dedupeKey?: string | null
}

interface PreferenceRecord {
  inApp: boolean
  email: boolean
}

function preferenceMapKey(userId: number, kind: string): string {
  return `${userId}:${kind}`
}

async function loadPreferenceRecords(db: Sql, userIds: number[]): Promise<Map<string, PreferenceRecord>> {
  const map = new Map<string, PreferenceRecord>()
  if (userIds.length === 0) {
    return map
  }

  const placeholders = userIds.map((_, index) => `$${index + 1}`).join(', ')
  const result = await db.query<{ user_id: number; kind: string; in_app: boolean; email: boolean }>(
    `select user_id, kind, in_app, email
       from notification_preferences
      where user_id in (${placeholders})`,
    userIds,
  )

  for (const row of result.rows) {
    map.set(preferenceMapKey(row.user_id, row.kind), { inApp: row.in_app, email: row.email })
  }
  return map
}

/**
 * Membuat baris notifikasi untuk tiap penerima. Preferensi user menentukan kanal:
 * kanal yang dimatikan tidak dikirim, dan penerima yang mematikan keduanya tidak
 * mendapat baris sama sekali. Kunci dedupe menahan baris kembar, misalnya saat
 * dua pergerakan stok pada hari yang sama sama-sama menyentuh batas minimum.
 */
export async function createNotifications(db: Sql, entries: NotificationInput[]): Promise<number> {
  if (entries.length === 0) {
    return 0
  }

  const prefs = await loadPreferenceRecords(db, [...new Set(entries.map((entry) => entry.userId))])
  let created = 0

  for (const entry of entries) {
    const pref = prefs.get(preferenceMapKey(entry.userId, entry.kind)) ?? { inApp: true, email: true }
    if (!pref.inApp && !pref.email) {
      continue
    }

    const inserted = await db.query(
      `insert into notifications
         (workspace_id, user_id, kind, title, body, href, in_app, email_requested, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
      [
        entry.workspaceId,
        entry.userId,
        entry.kind,
        entry.title,
        entry.body,
        entry.href ?? null,
        pref.inApp,
        pref.email,
        entry.dedupeKey ?? null,
      ],
    )
    created += inserted.affected
  }

  return created
}

export interface NotificationPreference {
  kind: NotificationKind
  inApp: boolean
  email: boolean
}

/** Preferensi tersimpan digabung dengan bawaan: baris yang tidak ada berarti menyala. */
export async function loadNotificationPreferences(db: Sql, userId: number): Promise<NotificationPreference[]> {
  const result = await db.query<{ kind: string; in_app: boolean; email: boolean }>(
    'select kind, in_app, email from notification_preferences where user_id = $1',
    [userId],
  )
  const stored = new Map(result.rows.map((row) => [row.kind, row]))

  return notificationKinds.map((kind) => {
    const row = stored.get(kind)
    return { kind, inApp: row?.in_app ?? true, email: row?.email ?? true }
  })
}

export async function saveNotificationPreferences(
  db: Sql,
  userId: number,
  updates: NotificationPreference[],
): Promise<void> {
  if (updates.length === 0) {
    return
  }

  const values: unknown[] = [userId]
  const rows = updates.map((update) => {
    values.push(update.kind, update.inApp, update.email)
    const base = values.length - 2
    return `($1, $${base}, $${base + 1}, $${base + 2})`
  })

  await db.query(
    `insert into notification_preferences (user_id, kind, in_app, email)
     values ${rows.join(', ')}
     on conflict (user_id, kind)
     do update set in_app = excluded.in_app, email = excluded.email`,
    values,
  )
}

export interface DigestSettings {
  enabled: boolean
  lastDigestAt: string | null
}

export async function loadDigestSettings(db: Sql, userId: number): Promise<DigestSettings> {
  const result = await db.query<{ enabled: boolean; last_digest_at: Date | string | null }>(
    'select enabled, last_digest_at from notification_digest_settings where user_id = $1',
    [userId],
  )
  const row = result.rows[0]
  return {
    enabled: row?.enabled ?? false,
    lastDigestAt: row?.last_digest_at ? new Date(row.last_digest_at).toISOString() : null,
  }
}

export async function saveDigestSettings(db: Sql, userId: number, enabled: boolean): Promise<void> {
  await db.query(
    `insert into notification_digest_settings (user_id, enabled)
     values ($1, $2)
     on conflict (user_id) do update set enabled = excluded.enabled`,
    [userId, enabled],
  )
}

export interface NotificationListItem {
  id: number
  kind: NotificationKind
  title: string
  body: string
  href: string | null
  workspaceId: number | null
  read: boolean
  createdAt: string
}

export interface NotificationListResult {
  notifications: NotificationListItem[]
  total: number
  unreadCount: number
}

/** Daftar notifikasi satu workspace, termasuk notifikasi tingkat akun. */
export async function listNotifications(
  db: Sql,
  input: { userId: number; workspaceId: number; unreadOnly?: boolean; limit: number; offset: number },
): Promise<NotificationListResult> {
  const filters = ['user_id = $1', 'in_app', '(workspace_id = $2 or workspace_id is null)']
  const params: unknown[] = [input.userId, input.workspaceId]
  if (input.unreadOnly) {
    filters.push('read_at is null')
  }

  const total = await db.query<{ count: number }>(
    `select count(*)::int as count from notifications where ${filters.join(' and ')}`,
    params,
  )

  const unread = await db.query<{ count: number }>(
    `select count(*)::int as count from notifications
      where user_id = $1 and in_app and (workspace_id = $2 or workspace_id is null) and read_at is null`,
    [input.userId, input.workspaceId],
  )

  const page = await db.query<{
    id: string
    workspace_id: number | null
    kind: string
    title: string
    body: string
    href: string | null
    read_at: Date | string | null
    created_at: Date | string
  }>(
    `select id, workspace_id, kind, title, body, href, read_at, created_at
       from notifications
      where ${filters.join(' and ')}
      order by created_at desc, id desc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, input.limit, input.offset],
  )

  return {
    notifications: page.rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind as NotificationKind,
      title: row.title,
      body: row.body,
      href: row.href,
      workspaceId: row.workspace_id,
      read: row.read_at !== null,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    total: total.rows[0]?.count ?? 0,
    unreadCount: unread.rows[0]?.count ?? 0,
  }
}

export async function countUnreadNotifications(
  db: Sql,
  userId: number,
  workspaceId: number,
): Promise<number> {
  const result = await db.query<{ count: number }>(
    `select count(*)::int as count from notifications
      where user_id = $1 and in_app and (workspace_id = $2 or workspace_id is null) and read_at is null`,
    [userId, workspaceId],
  )
  return result.rows[0]?.count ?? 0
}

/**
 * Menandai notifikasi milik pengguna sendiri sebagai sudah dibaca. Tanpa daftar
 * id, semua notifikasi yang terlihat di workspace ini ditandai.
 */
export async function markNotificationsRead(
  db: Sql,
  input: { userId: number; workspaceId: number; ids?: number[] },
): Promise<number> {
  if (input.ids && input.ids.length === 0) {
    return 0
  }

  const params: unknown[] = [input.userId, input.workspaceId]
  let filter = ''
  if (input.ids) {
    const placeholders = input.ids.map((_, index) => `$${params.length + index + 1}`)
    params.push(...input.ids)
    filter = ` and id in (${placeholders.join(', ')})`
  }

  const result = await db.query(
    `update notifications set read_at = now()
      where user_id = $1 and (workspace_id = $2 or workspace_id is null)
        and read_at is null${filter}`,
    params,
  )
  return result.affected
}

export interface NotificationSenderDeps {
  db: Database
  sendEmail: (message: EmailMessage) => Promise<void>
  webOrigin: string
  onError?: (error: unknown, notificationId: number) => void
}

/**
 * Mengirim email notifikasi yang masih menunggu di antrean.
 *
 * Baris diklaim lebih dulu lewat update bersyarat, jadi dua pengirim yang
 * berjalan bersamaan tidak pernah mengirim pesan yang sama dua kali. Kalau
 * pengiriman gagal, klaimnya dilepas supaya percobaan berikutnya mengambilnya
 * lagi. Email crash tidak pernah menggagalkan pengiriman baris lain.
 */
export async function flushNotificationEmails(
  deps: NotificationSenderDeps,
  limit = 25,
): Promise<number> {
  const pending = await deps.db.query<{ id: string; to_email: string; title: string; body: string; href: string | null }>(
    `select n.id, u.email as to_email, n.title, n.body, n.href
       from notifications n
       join users u on u.id = n.user_id
      where n.email_requested and n.emailed_at is null and u.deleted_at is null
      order by n.id
      limit $1`,
    [limit],
  )

  let sent = 0
  for (const row of pending.rows) {
    const id = Number(row.id)
    const claimed = await deps.db.query(
      'update notifications set emailed_at = now() where id = $1 and emailed_at is null',
      [id],
    )
    if (claimed.affected === 0) {
      continue
    }

    try {
      await deps.sendEmail({
        to: row.to_email,
        subject: row.title,
        body: `${row.body}\n\nBuka di Sahabat UMKM: ${
          row.href ? `${deps.webOrigin}${row.href}` : `${deps.webOrigin}/notifikasi`
        }`,
      })
      sent += 1
    } catch (error) {
      await deps.db.query('update notifications set emailed_at = null where id = $1', [id])
      deps.onError?.(error, id)
    }
  }

  return sent
}
