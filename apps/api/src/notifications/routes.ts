import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import {
  notificationKindDescriptions,
  notificationKindLabel,
  notificationKindLabels,
  notificationKinds,
} from '@sahabat/shared'
import { loadWorkspaceRole, requireSession } from '../auth/session.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import {
  countUnreadNotifications,
  listNotifications,
  loadDigestSettings,
  loadNotificationPreferences,
  markNotificationsRead,
  saveDigestSettings,
  saveNotificationPreferences,
} from './service.ts'

/**
 * Endpoint notifikasi PRD 6.9.
 *
 * Daftar dan hitungan belum dibaca dibatasi ke workspace yang sedang dipakai,
 * plus notifikasi tingkat akun (aktivitas keamanan) yang memang bukan milik satu
 * workspace. Pemeriksaannya lewat loadWorkspaceRole, jadi pengguna yang bukan
 * anggota workspace lain tidak pernah melihat daftar apa pun dari sana (PRD 9).
 *
 * Pengaturan kanal melekat pada akun, bukan workspace, karena satu pengguna
 * boleh menjadi anggota beberapa usaha dengan satu alamat email.
 */

const listQuerySchema = z.object({
  unread: z.literal('1').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const readSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
})

const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        kind: z.enum(notificationKinds),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .max(notificationKinds.length)
    .optional(),
  digestEnabled: z.boolean().optional(),
})

function kindOptions(): Array<{ kind: string; label: string; description: string }> {
  return notificationKinds.map((kind) => ({
    kind,
    label: notificationKindLabels[kind],
    description: notificationKindDescriptions[kind],
  }))
}

export function registerNotificationRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  const readPreferencePayload = async (
    userId: number,
  ): Promise<{
    preferences: Array<{ kind: string; label: string; description: string; inApp: boolean; email: boolean }>
    digestEnabled: boolean
  }> => {
    const preferences = await loadNotificationPreferences(db, userId)
    const digest = await loadDigestSettings(db, userId)
    return {
      preferences: kindOptions().map((option) => {
        const stored = preferences.find((item) => item.kind === option.kind)
        return { ...option, inApp: stored?.inApp ?? true, email: stored?.email ?? true }
      }),
      digestEnabled: digest.enabled,
    }
  }

  app.get('/api/workspaces/:workspaceId/notifications', async (request: FastifyRequest, reply) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    const context = await loadWorkspaceRole(db, request, workspaceId)
    const query = listQuerySchema.parse(request.query ?? {})

    const result = await listNotifications(db, {
      userId: context.userId,
      workspaceId,
      unreadOnly: query.unread === '1',
      limit: query.limit,
      offset: query.offset,
    })

    return reply.code(200).send({
      notifications: result.notifications.map((item) => ({
        ...item,
        kindLabel: notificationKindLabel(item.kind),
      })),
      total: result.total,
      unreadCount: result.unreadCount,
      limit: query.limit,
      offset: query.offset,
    })
  })

  app.get(
    '/api/workspaces/:workspaceId/notifications/unread-count',
    async (request: FastifyRequest, reply) => {
      const workspaceId = idFrom(paramsOf(request).workspaceId)
      const context = await loadWorkspaceRole(db, request, workspaceId)
      const unreadCount = await countUnreadNotifications(db, context.userId, workspaceId)
      return reply.code(200).send({ unreadCount })
    },
  )

  app.post('/api/workspaces/:workspaceId/notifications/read', async (request: FastifyRequest, reply) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    const context = await loadWorkspaceRole(db, request, workspaceId)
    const input = readSchema.parse(request.body ?? {})

    const marked = await markNotificationsRead(db, {
      userId: context.userId,
      workspaceId,
      ids: input.ids,
    })
    return reply.code(200).send({ marked })
  })

  app.post(
    '/api/workspaces/:workspaceId/notifications/read-all',
    async (request: FastifyRequest, reply) => {
      const workspaceId = idFrom(paramsOf(request).workspaceId)
      const context = await loadWorkspaceRole(db, request, workspaceId)

      const marked = await markNotificationsRead(db, { userId: context.userId, workspaceId })
      return reply.code(200).send({ marked })
    },
  )

  app.get('/api/notifications/preferences', async (request, reply) => {
    const session = requireSession(request)
    const payload = await readPreferencePayload(session.userId)
    return reply.code(200).send(payload)
  })

  app.patch('/api/notifications/preferences', async (request, reply) => {
    const session = requireSession(request)
    const input = preferencesSchema.parse(request.body ?? {})

    await saveNotificationPreferences(db, session.userId, input.preferences ?? [])
    if (input.digestEnabled !== undefined) {
      await saveDigestSettings(db, session.userId, input.digestEnabled)
    }

    const payload = await readPreferencePayload(session.userId)
    return reply.code(200).send({ message: 'Pengaturan notifikasi tersimpan.', ...payload })
  })
}
