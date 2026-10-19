import type { FastifyInstance } from 'fastify'
import {
  billingPeriods,
  planCatalog,
  planCodes,
  TRIAL_DAYS,
  YEARLY_MONTHS,
  type BillingPeriod,
  type PlanCode,
} from '@sahabat/shared'
import type { Database } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import type { EmailMessage } from '../auth/routes.ts'
import { requireCapability, idFrom, paramsOf } from '../purchasing/routes.ts'
import {
  midtransAction,
  midtransSignature,
  midtransSignatureMatches,
  type PaymentGateway,
} from '../services/payment-gateway.ts'
import { StockError } from '../stock/movements.ts'
import type { BillingConfig } from './billing.ts'
import {
  loadPaymentForInvoice,
  loadPayments,
  settlePayment,
  startCheckout,
  type SettlementAction,
} from './billing-service.ts'
import { renderInvoicePdf } from './invoice-pdf.ts'
import { assertPlanFits, effectivePlan, lockWorkspace } from './service.ts'

/**
 * Paket, langganan, dan penagihan (PRD 6.10).
 *
 * Rute langganan dibatasi izin `subscription.manage`, yang hanya dimiliki
 * Owner (PRD 8). Endpoint notifikasi pembayaran adalah satu-satunya rute tanpa
 * sesi di sini: ia terbuka untuk Midtrans dan keasliannya dijaga tanda tangan
 * SHA-512 dengan kunci server, bukan cookie.
 */

export interface PlanRouteDeps {
  db: Database
  billing: BillingConfig
  gateway: PaymentGateway | null
  sendEmail: (message: EmailMessage) => Promise<void>
  webOrigin: string
  onError?: (error: unknown, context: string) => void
}

export function registerPlanRoutes(app: FastifyInstance, deps: PlanRouteDeps): void {
  const { db, billing, gateway, sendEmail, webOrigin, onError } = deps

  app.get('/api/workspaces/:workspaceId/subscription', async (request) => {
    const context = await requireCapability(db, request, 'reports.stock')
    const { plan, subscription } = await db.transaction(async (tx) => {
      await lockWorkspace(tx, context.workspaceId)
      const plan = await effectivePlan(tx, context.workspaceId)
      const found = await tx.query<{
        status: string
        trial_started_at: Date | null
        trial_ends_at: Date | null
        trial_used_at: Date | null
        current_period_end: Date | null
        billing_period: BillingPeriod | null
      }>(
        `select status, trial_started_at, trial_ends_at, trial_used_at, current_period_end, billing_period
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
        currentPeriodEnd: plan === 'gratis' ? null : subscription?.current_period_end ?? null,
        billingPeriod: plan === 'gratis' ? null : subscription?.billing_period ?? null,
      },
      plans: planCodes.map((code) => ({ code, ...planCatalog[code] })),
      pricingNote: 'Harga bulanan pada tabel paket adalah usulan PRD dan belum ditetapkan.',
      billingEnabled: billing.enabled,
      billing: { refundPolicyUrl: billing.refundPolicyUrl, yearlyMonths: YEARLY_MONTHS },
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
        plan_code: PlanCode
        status: string
        trial_used_at: Date | null
        current_period_end: Date | null
      }>(
        `select plan_code, status, trial_used_at, current_period_end
           from workspace_subscriptions where workspace_id = $1 for update`,
        [context.workspaceId],
      )
      const subscription = current.rows[0]!
      if (requested === 'gratis') {
        if (effective !== 'gratis') await assertPlanFits(tx, context.workspaceId, 'gratis')
        await tx.query(
          `update workspace_subscriptions set plan_code = 'gratis', status = 'aktif',
             trial_started_at = null, trial_ends_at = null,
             current_period_end = null, billing_period = null,
             renewal_reminder_7d_at = null, renewal_reminder_1d_at = null
           where workspace_id = $1`,
          [context.workspaceId],
        )
        return { plan: 'gratis' as const, status: 'aktif' }
      }
      if (effective !== 'gratis' && subscription.status === 'uji_coba') {
        throw new StockError('uji_coba_aktif', 'Uji coba paket yang sedang aktif tidak dapat diganti.', 409)
      }
      // Uji coba bukan pengganti langganan yang sedang berjalan: pemilik yang
      // sudah membayar masa berjalan tidak diarahkan ke uji coba lagi.
      if (subscription.current_period_end && new Date(subscription.current_period_end).getTime() > Date.now()) {
        throw new StockError(
          'langganan_aktif',
          'Langganan yang sedang aktif tidak dapat diganti dengan uji coba.',
          409,
        )
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
    return reply.code(200).send({ subscription: changed, billingEnabled: billing.enabled })
  })

  app.post('/api/workspaces/:workspaceId/subscription/checkout', async (request, reply) => {
    const context = await requireCapability(db, request, 'subscription.manage')
    if (!billing.enabled || !gateway) {
      throw new StockError(
        'pembayaran_belum_aktif',
        'Pembayaran dan faktur belum diaktifkan. Paket berbayar masih bisa diuji tanpa kartu.',
        409,
      )
    }

    const body = request.body as { plan?: unknown; period?: unknown }
    if (body?.plan !== 'usaha' && body?.plan !== 'bisnis') {
      throw new StockError('data_tidak_valid', 'Paket yang dipilih tidak dikenal.', 400)
    }
    if (typeof body?.period !== 'string' || !billingPeriods.includes(body.period as BillingPeriod)) {
      throw new StockError('data_tidak_valid', 'Masa pembayaran yang dipilih tidak dikenal.', 400)
    }

    const payment = await startCheckout(
      { db, gateway, webOrigin, ...(onError ? { onError } : {}) },
      {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        plan: body.plan,
        period: body.period as BillingPeriod,
      },
    )

    await writeAudit(db, {
      workspaceId: context.workspaceId,
      actorUserId: context.userId,
      actorRole: context.role,
      action: 'payment.created',
      objectType: 'payment',
      objectId: String(payment.id),
      metadata: { number: payment.number, plan: payment.plan, period: payment.period, amount: payment.amount },
    })

    return reply.code(201).send({ payment })
  })

  app.get('/api/workspaces/:workspaceId/subscription/payments', async (request) => {
    const context = await requireCapability(db, request, 'subscription.manage')
    return { payments: await loadPayments(db, context.workspaceId) }
  })

  app.get('/api/workspaces/:workspaceId/subscription/payments/:paymentId/invoice.pdf', async (request, reply) => {
    const context = await requireCapability(db, request, 'subscription.manage')
    const paymentId = idFrom(paramsOf(request).paymentId)
    const invoice = await loadPaymentForInvoice(db, context.workspaceId, paymentId)
    if (!invoice) {
      throw new StockError('pembayaran_tidak_ditemukan', 'Pembayaran tidak ditemukan.', 404)
    }

    return reply
      .code(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(await renderInvoicePdf({ invoice, seller: billing.seller }))
  })

  /**
   * Notifikasi pembayaran Midtrans. Tanpa sesi, jadi keasliannya hanya dijaga
   * tanda tangan. Jawaban selalu 200 untuk notifikasi yang sah, termasuk
   * pesanan yang tidak dikenal, supaya Midtrans tidak mengirim ulang pesan yang
   * tidak akan pernah berubah hasilnya.
   */
  app.post('/api/payments/midtrans/notification', async (request, reply) => {
    if (!billing.enabled || !billing.serverKey) {
      return reply.code(404).send({ error: 'pembayaran_belum_aktif' })
    }

    const body = (request.body ?? {}) as Record<string, unknown>
    const orderId = typeof body.order_id === 'string' ? body.order_id : ''
    const statusCode = typeof body.status_code === 'string' ? body.status_code : ''
    const grossAmount = typeof body.gross_amount === 'string' ? body.gross_amount : ''
    const signature = typeof body.signature_key === 'string' ? body.signature_key : ''
    const transactionStatus = typeof body.transaction_status === 'string' ? body.transaction_status : ''
    const fraudStatus = typeof body.fraud_status === 'string' ? body.fraud_status : null
    const paymentType = typeof body.payment_type === 'string' ? body.payment_type : null

    if (!orderId || !statusCode || !grossAmount || !signature || !transactionStatus) {
      throw new StockError('data_tidak_valid', 'Notifikasi pembayaran tidak lengkap.', 400)
    }

    const expected = midtransSignature({ orderId, statusCode, grossAmount, serverKey: billing.serverKey })
    if (!midtransSignatureMatches(signature, expected)) {
      request.log.warn({ orderId }, 'notifikasi pembayaran dengan tanda tangan yang tidak cocok')
      throw new StockError('tanda_tangan_tidak_valid', 'Tanda tangan notifikasi tidak cocok.', 401)
    }

    const action = midtransAction(transactionStatus, fraudStatus)
    if (action === 'abaikan') {
      return reply.code(200).send({ received: true, action })
    }

    const result = await settlePayment(
      { db, sendEmail, webOrigin, ...(onError ? { onError } : {}) },
      {
        orderId,
        action: action as SettlementAction,
        paymentMethod: paymentType,
        paidAmount: Number(grossAmount),
      },
    )
    if (!result.found) {
      request.log.warn({ orderId }, 'notifikasi pembayaran untuk pesanan yang tidak dikenal')
    }

    return reply.code(200).send({ received: true, action })
  })
}
