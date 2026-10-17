import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database } from '@sahabat/db'
import { can, planCatalog } from '@sahabat/shared'
import { loadWorkspaceRole } from '../auth/session.ts'
import { readEffectivePlan } from '../plans/service.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import { createDashboard, type DashboardAccess, type DashboardFilter } from './service.ts'

/**
 * Dashboard (PRD 6.7).
 *
 * Izinnya tidak diperiksa dengan satu penjaga tunggal karena dashboard
 * menggabungkan beberapa modul. Setiap bagian memakai izin laporan yang sama
 * dengan halaman laporan, jadi peran yang tidak boleh membaca laporan pembelian
 * juga tidak menerima kartu dan tren pembelian di sini (PRD 8, B-02). Peran
 * Staf, yang memang tidak punya izin laporan, tetap bisa membuka halaman dan
 * mendapat penjelasan serta tautan ke halaman yang bisa dipakainya.
 */

const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Tanggal tidak valid.')

const filterSchema = z
  .object({
    from: dateFilter.optional(),
    to: dateFilter.optional(),
    locationId: z.coerce.number().int().positive().optional(),
  })
  .refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
    message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
  })

export function registerDashboardRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/dashboard', async (request: FastifyRequest, reply) => {
    const workspaceId = idFrom(paramsOf(request).workspaceId)
    const context = await loadWorkspaceRole(db, request, workspaceId)
    const filter = filterSchema.parse(request.query ?? {}) as DashboardFilter

    const access: DashboardAccess = {
      stock: can(context.role, 'reports.stock'),
      sales: can(context.role, 'reports.sales'),
      purchasing: can(context.role, 'reports.purchasing'),
      debts: can(context.role, 'reports.debt'),
    }

    // Utang supplier ikut fitur paket retur dan utang (PRD 16), sama seperti
    // laporan utang. Pemeriksaannya dibaca, bukan dilempar, karena bagian lain
    // dashboard tetap boleh tampil untuk paket Gratis.
    if (access.debts) {
      const plan = await readEffectivePlan(db, workspaceId)
      access.debts = planCatalog[plan].returns
    }

    const result = await createDashboard(db, workspaceId, filter, access)
    return reply.code(200).send(result)
  })
}
