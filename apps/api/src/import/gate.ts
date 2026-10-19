import type { FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { can } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole } from '../auth/session.ts'
import { idFrom, paramsOf, type WorkspaceContext } from '../purchasing/routes.ts'

/**
 * Gerbang izin semua endpoint impor. Pesannya menyebut siapa yang boleh, bukan
 * hanya "tidak diizinkan", karena halaman impor terlihat di menu dan pengguna
 * perlu tahu kenapa tombolnya tidak jalan.
 */
export async function requireImportGate(
  db: Database,
  request: FastifyRequest,
): Promise<WorkspaceContext> {
  const workspaceId = idFrom(paramsOf(request).workspaceId)
  const { workspaceId: id, role, userId } = await loadWorkspaceRole(db, request, workspaceId)

  if (!can(role, 'data.import')) {
    throw new AuthorizationError('Impor hanya bisa dilakukan Owner dan Admin.')
  }

  return { workspaceId: id, role, userId }
}
