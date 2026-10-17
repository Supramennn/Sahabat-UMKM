import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { grantFor } from '@sahabat/shared'
import { writeAudit } from '../auth/audit.ts'
import { AuthorizationError, loadWorkspaceRole } from '../auth/session.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import { buildWorkspaceExport } from './service.ts'
import { buildZip } from './zip.ts'

/**
 * Ekspor seluruh data workspace (PRD 6.8).
 *
 * Arsipnya berisi seluruh tabel bisnis dalam CSV dan bisa diunduh Owner kapan
 * saja tanpa biaya tambahan, jadi tidak ada pemeriksaan paket di sini. Batas
 * enam puluh permintaan per menit di bawah menjaga endpoint berat ini tidak
 * dipanggil berulang oleh klien yang macet; batas globalnya sendiri jauh lebih
 * longgar.
 */
export function registerExportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/exports/workspace', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    const context = await loadWorkspaceRole(db, request, workspaceId)

    // PRD 6.8 meminta ekspor oleh Owner. Admin mendapat izin yang sama lewat
    // tabel izin, sedangkan Purchasing hanya 'partial' (laporan pembelian saja),
    // jadi ekspor penuh ditolak. Nilai grant dibaca langsung karena `can`
    // menganggap 'partial' sebagai boleh.
    if (grantFor(context.role, 'data.export') !== 'manage') {
      throw new AuthorizationError('Hanya Owner dan Admin yang dapat mengunduh seluruh data workspace.')
    }

    const { fileName, entries } = await buildWorkspaceExport(db, workspaceId)

    await writeAudit(db, {
      workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'data.export',
      objectType: 'workspace',
      objectId: String(workspaceId),
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      metadata: { cakupan: 'seluruh_data', berkas: entries.length },
    })

    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buildZip(entries))
  })
}
