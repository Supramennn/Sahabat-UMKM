import type { FastifyInstance } from 'fastify'
import { planCatalog, planCodes, TRIAL_DAYS, type PlanCode } from '@sahabat/shared'
import type { Database } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { requireCapability } from '../purchasing/routes.ts'
import { StockError } from '../stock/movements.ts'
import { assertPlanFits, effectivePlan, lockWorkspace } from './service.ts'

export function registerPlanRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps
  app.get('/api/workspaces/:workspaceId/subscription', async (request) => {
    const context = await requireCapability(db, request, 'reports.stock')
    const { plan, subscription } = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      const plan = await effectivePlan(tx, context.workspaceId)
      const found = await tx.query<{
        status: string; trial_started_at: Date | null; trial_ends_at: Date | null; trial_used_at: Date | null
      }>(
        `select status, trial_started_at, trial_ends_at, trial_used_at
           from workspace_subscriptions where workspace_id = $1`,
        [context.workspaceId],
      )
      return { plan, subscription: found.rows[0] }
    })
    return {
      subscription: {
        plan,
        status: plan === 'gratis' ? 'aktif' : subscription?.status ?? 'aktif',
        trialStartedAt: subscription?.trial_started_at ?? null,
        trialEndsAt: subscription?.trial_ends_at ?? null,
        trialUsed: Boolean(subscription?.trial_used_at),
      },
      plans: planCodes.map((code) => ({ code, ...planCatalog[code] })),
      pricingNote: 'Harga bulanan pada tabel paket adalah usulan PRD dan belum ditetapkan.',
      billingEnabled: false,
    }
  })

  app.post('/api/workspaces/:workspaceId/subscription/plan', async (request, reply) => {
    const context = await requireCapability(db, request, 'subscription.manage')
    const body = request.body as { plan?: unknown }
    if (typeof body?.plan !== 'string' || !planCodes.includes(body.plan as PlanCode)) {
      throw new StockError('data_tidak_valid', 'Paket yang dipilih tidak dikenal.', 400)
    }
    const requested = body.plan as PlanCode
    const changed = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      const effective = await effectivePlan(tx, context.workspaceId)
      const current = await tx.query<{
        plan_code: PlanCode; status: string; trial_used_at: Date | null; trial_ends_at: Date | string | null
      }>(
        `select plan_code, status, trial_used_at, trial_ends_at from workspace_subscriptions where workspace_id = $1 for update`,
        [context.workspaceId],
      )
      const subscription = current.rows[0]!
      if (requested === 'gratis') {
        if (effective !== 'gratis') await assertPlanFits(tx, context.workspaceId, 'gratis')
        await tx.query(
          `update workspace_subscriptions set plan_code = 'gratis', status = 'aktif',
             trial_started_at = null, trial_ends_at = null where workspace_id = $1`,
          [context.workspaceId],
        )
        return { plan: 'gratis' as const, status: 'aktif' }
      }
      if (effective !== 'gratis' && subscription.status === 'uji_coba') {
        throw new StockError('uji_coba_aktif', 'Uji coba paket yang sedang aktif tidak dapat diganti.', 409)
      }
      if (subscription.trial_used_at) {
        throw new StockError('uji_coba_sudah_digunakan', 'Masa uji coba 14 hari hanya tersedia satu kali untuk setiap workspace.', 409)
      }
      await assertPlanFits(tx, context.workspaceId, requested)
      await tx.query(
        `update workspace_subscriptions set plan_code = $2, status = 'uji_coba',
           trial_started_at = now(), trial_ends_at = now() + make_interval(days => $3), trial_used_at = now()
         where workspace_id = $1`,
        [context.workspaceId, requested, TRIAL_DAYS],
      )
      return { plan: requested, status: 'uji_coba' }
    })
    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'subscription.plan_changed',
      objectType: 'subscription',
      metadata: { plan: changed.plan, status: changed.status },
    })
    return reply.code(200).send({ subscription: changed, billingEnabled: false })
  })
}
