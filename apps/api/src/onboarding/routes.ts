import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Database } from '@sahabat/db'
import { loadWorkspaceRole } from '../auth/session.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import { StockError } from '../stock/movements.ts'
import {
  LANGKAH_AKTIVASI,
  muatChecklistAktivasi,
} from './service.ts'

/**
 * Daftar periksa aktivasi (PRD 12).
 *
 * Membaca daftar langkah bisa dilakukan semua anggota workspace, karena isinya
 * hanya nama langkah dan keadaannya. Melompati atau membuka kembali langkah
 * memengaruhi tampilan semua anggota, jadi cuma Owner dan Admin yang boleh.
 * Server memeriksa perannya di sini; menyembunyikan tombol di peramban bukan
 * kontrol keamanan.
 */

const patchSchema = z.object({
  step: z.enum(LANGKAH_AKTIVASI),
  skipped: z.boolean(),
})

export function registerOnboardingRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/onboarding', async (request: FastifyRequest) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    await loadWorkspaceRole(db, request, workspaceId)
    return muatChecklistAktivasi(db, workspaceId)
  })

  app.patch('/api/workspaces/:workspaceId/onboarding', async (request: FastifyRequest) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    const context = await loadWorkspaceRole(db, request, workspaceId)
    const input = patchSchema.parse(request.body ?? {})

    if (context.role !== 'owner' && context.role !== 'admin') {
      throw new StockError(
        'tidak_diizinkan',
        'Hanya Owner dan Admin yang bisa melompati atau membuka langkah aktivasi.',
        403,
      )
    }

    if (input.skipped) {
      await db.query(
        `insert into workspace_onboarding_skips (workspace_id, step, created_by)
         values ($1, $2, $3)
         on conflict (workspace_id, step)
         do update set created_by = excluded.created_by, created_at = now()`,
        [workspaceId, input.step, context.userId],
      )
    } else {
      await db.query('delete from workspace_onboarding_skips where workspace_id = $1 and step = $2', [
        workspaceId,
        input.step,
      ])
    }

    const checklist = await muatChecklistAktivasi(db, workspaceId)
    // Langkah yang baru dilompati wajib muncul lagi di daftar dengan tanda
    // dilewati, sesuai PRD 12: langkah opsional bisa dilewati dan ditemukan lagi.
    return checklist
  })
}
