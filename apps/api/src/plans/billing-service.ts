import { randomBytes } from 'node:crypto'
import type { Database, Sql } from '@sahabat/db'
import {
  billingPeriodLabels,
  formatRupiah,
  planCatalog,
  planPrice,
  type BillingPeriod,
  type PlanCode,
} from '@sahabat/shared'
import type { EmailMessage } from '../auth/routes.ts'
import { writeAudit } from '../auth/audit.ts'
import type { PaymentGateway } from '../services/payment-gateway.ts'
import { StockError } from '../stock/movements.ts'
import { assertPlanFits, lockWorkspace } from './service.ts'

/**
 * Penagihan langganan (PRD 6.10).
 *
 * Tiga hal yang menentukan bentuk berkas ini:
 *
 * 1. Baris pembayaran ditulis dan di-commit sebelum tautan pembayaran diminta
 *    ke Midtrans. Kalau urutannya dibalik, tautan yang sudah terbayar bisa tidak
 *    punya baris yang bisa ditelusuri.
 * 2. Panggilan jaringan tidak pernah di dalam transaksi database. Kegagalan
 *    Midtrans menandai tagihan gagal, bukan menggantung transaksi.
 * 3. Status lunas dipercaya hanya dari notifikasi yang ditandatangani, bukan
 *    dari halaman yang dibuka pengguna setelah membayar.
 */

/** Tagihan yang tidak dibayar dalam sehari dianggap kedaluwarsa. */
export const PAYMENT_EXPIRY_HOURS = 24

export type PaymentStatus = 'menunggu' | 'dibayar' | 'gagal' | 'kedaluwarsa'

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  menunggu: 'Menunggu pembayaran',
  dibayar: 'Dibayar',
  gagal: 'Gagal',
  kedaluwarsa: 'Kedaluwarsa',
}

export interface PaymentView {
  id: number
  number: string
  plan: PlanCode
  planName: string
  period: BillingPeriod
  periodLabel: string
  amount: number
  status: PaymentStatus
  statusLabel: string
  paymentMethod: string | null
  paymentMethodLabel: string | null
  redirectUrl: string | null
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

const paymentMethodLabels: Record<string, string> = {
  credit_card: 'Kartu kredit atau debit',
  bank_transfer: 'Transfer bank',
  echannel: 'Mandiri Bill',
  qris: 'QRIS',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  cstore: 'Gerai ritel',
  akulaku: 'Akulaku',
}

/** Nilai mentah dari Midtrans dipetakan ke label yang bisa dibaca; yang tidak dikenal ditampilkan apa adanya. */
export function paymentMethodLabel(method: string | null): string | null {
  if (!method) {
    return null
  }
  return paymentMethodLabels[method] ?? method
}

interface PaymentRecord {
  id: number | string
  number: string
  plan_code: PlanCode
  billing_period: BillingPeriod
  amount: number | string
  status: PaymentStatus
  payment_method: string | null
  provider_redirect_url: string | null
  created_at: Date | string
  paid_at: Date | string | null
  expires_at: Date | string
}

function toPaymentView(row: PaymentRecord): PaymentView {
  return {
    id: Number(row.id),
    number: row.number,
    plan: row.plan_code,
    planName: planCatalog[row.plan_code].name,
    period: row.billing_period,
    periodLabel: billingPeriodLabels[row.billing_period],
    amount: Number(row.amount),
    status: row.status,
    statusLabel: paymentStatusLabels[row.status] ?? row.status,
    paymentMethod: row.payment_method,
    paymentMethodLabel: paymentMethodLabel(row.payment_method),
    redirectUrl: row.provider_redirect_url,
    createdAt: new Date(row.created_at).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
  }
}

const paymentColumns =
  'id, number, plan_code, billing_period, amount, status, payment_method, provider_redirect_url, created_at, paid_at, expires_at'

export interface CheckoutInput {
  workspaceId: number
  actorUserId: number
  plan: PlanCode
  period: BillingPeriod
}

export interface CheckoutDeps {
  db: Database
  gateway: PaymentGateway
  webOrigin: string
  onError?: (error: unknown, context: string) => void
}

export async function startCheckout(deps: CheckoutDeps, input: CheckoutInput): Promise<PaymentView> {
  const amount = planPrice(input.plan, input.period)
  if (amount <= 0) {
    throw new StockError('paket_tidak_dikenal', 'Paket yang dipilih tidak berlangganan.', 400)
  }

  const orderId = `SU-${input.workspaceId}-${randomBytes(8).toString('hex')}`
  const payer = await deps.db.query<{ name: string; email: string }>(
    'select name, email from users where id = $1',
    [input.actorUserId],
  )
  const payerRow = payer.rows[0]
  if (!payerRow) {
    throw new StockError('pengguna_tidak_ditemukan', 'Akun pemesan tidak ditemukan.', 404)
  }

  const created = await deps.db.transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId)
    // Penurunan paket yang melewati batas ditolak di sini, sebelum ada tagihan:
    // membayar paket yang tidak boleh dipakai adalah kerugian bagi pemiliknya.
    await assertPlanFits(tx, input.workspaceId, input.plan)
    const inserted = await tx.query<PaymentRecord>(
      `insert into payments (workspace_id, plan_code, billing_period, amount, provider_order_id, expires_at, created_by)
       values ($1, $2, $3, $4, $5, now() + make_interval(hours => $6), $7)
       returning ${paymentColumns}`,
      [input.workspaceId, input.plan, input.period, amount, orderId, PAYMENT_EXPIRY_HOURS, input.actorUserId],
    )
    return inserted.rows[0]!
  })

  try {
    const transaction = await deps.gateway.createTransaction({
      orderId,
      amount,
      itemName: `Paket ${planCatalog[input.plan].name}, ${input.period === 'bulanan' ? '1 bulan' : '12 bulan'}`,
      payerName: payerRow.name,
      payerEmail: payerRow.email,
      finishUrl: `${deps.webOrigin}/pengaturan/paket?payment=${Number(created.id)}`,
    })
    await deps.db.query('update payments set provider_token = $2, provider_redirect_url = $3 where id = $1', [
      Number(created.id),
      transaction.token,
      transaction.redirectUrl,
    ])
    return toPaymentView({ ...created, provider_redirect_url: transaction.redirectUrl })
  } catch (error) {
    await deps.db.query(`update payments set status = 'gagal' where id = $1 and status = 'menunggu'`, [
      Number(created.id),
    ])
    deps.onError?.(error, `tagihan ${created.number} dibuat`)
    throw new StockError(
      'pembayaran_gagal_dibuat',
      'Tautan pembayaran tidak bisa dibuat. Coba lagi sebentar lagi.',
      502,
    )
  }
}

export async function loadPayments(db: Sql, workspaceId: number, limit = 50): Promise<PaymentView[]> {
  const result = await db.query<PaymentRecord>(
    `select ${paymentColumns} from payments
      where workspace_id = $1
      order by created_at desc, id desc
      limit $2`,
    [workspaceId, limit],
  )
  return result.rows.map(toPaymentView)
}

export type SettlementAction = Exclude<PaymentStatus, 'menunggu'>

export interface SettlementInput {
  orderId: string
  action: SettlementAction
  paymentMethod: string | null
  /** Nominal menurut gateway, dipakai memastikan notifikasi cocok dengan tagihan. */
  paidAmount: number
}

export interface SettlementDeps {
  db: Database
  sendEmail: (message: EmailMessage) => Promise<void>
  webOrigin: string
  onError?: (error: unknown, context: string) => void
}

export interface SettlementResult {
  found: boolean
  /** Ada perubahan status pada panggilan ini; notifikasi ulang tidak mengubah apa pun. */
  changed: boolean
  paidWorkspaceId: number | null
}

interface SettledPayment {
  id: number
  workspaceId: number
  number: string
  plan: PlanCode
  period: BillingPeriod
  amount: number
  periodEnd: Date | string | null
  createdBy: number | null
}

/**
 * Menyelesaikan satu notifikasi gateway. Pembayaran yang sudah lunas tidak
 * diperpanjang dua kali, jadi notifikasi yang datang berulang aman. Periode
 * yang belum habis tidak hangus: masa baru dihitung dari ujung masa berjalan,
 * sehingga pembelian lebih awal hanya menambah waktu.
 */
export async function settlePayment(
  deps: SettlementDeps,
  input: SettlementInput,
): Promise<SettlementResult> {
  const settled = await deps.db.transaction(async (tx) => {
    const found = await tx.query<PaymentRecord & { workspace_id: number; created_by: number | null }>(
      `select ${paymentColumns}, workspace_id, created_by from payments where provider_order_id = $1 for update`,
      [input.orderId],
    )
    const row = found.rows[0]
    if (!row) {
      return { found: false, changed: false, settled: null }
    }

    const workspaceId = Number(row.workspace_id)
    const id = Number(row.id)
    if (row.status === 'dibayar') {
      return { found: true, changed: false, settled: null }
    }

    if (input.action !== 'dibayar') {
      if (row.status !== 'menunggu') {
        return { found: true, changed: false, settled: null }
      }
      await tx.query('update payments set status = $2 where id = $1', [id, input.action])
      return { found: true, changed: true, settled: null }
    }

    // Nominal diperiksa lagi sebelum melunasi: notifikasi dengan jumlah berbeda
    // bisa berarti pesanan tertukar, dan masa langganan tidak boleh diberikan.
    if (Number(row.amount) !== input.paidAmount) {
      throw new StockError(
        'nominal_tidak_cocok',
        'Nominal pembayaran tidak sama dengan tagihan.',
        400,
        { orderId: input.orderId },
      )
    }

    await lockWorkspace(tx, workspaceId)
    await tx.query(
      `update payments set status = 'dibayar', paid_at = now(), payment_method = $2 where id = $1`,
      [id, input.paymentMethod],
    )
    const months = row.billing_period === 'tahunan' ? 12 : 1
    const subscription = await tx.query<{ current_period_end: Date | string }>(
      `update workspace_subscriptions
          set plan_code = $2, status = 'aktif',
              trial_started_at = null, trial_ends_at = null,
              current_period_end = greatest(coalesce(current_period_end, now()), now()) + make_interval(months => $3),
              billing_period = $4,
              renewal_reminder_7d_at = null, renewal_reminder_1d_at = null
        where workspace_id = $1
        returning current_period_end`,
      [workspaceId, row.plan_code, months, row.billing_period],
    )

    const payment: SettledPayment = {
      id,
      workspaceId,
      number: row.number,
      plan: row.plan_code,
      period: row.billing_period,
      amount: Number(row.amount),
      periodEnd: subscription.rows[0]?.current_period_end ?? null,
      createdBy: row.created_by === null ? null : Number(row.created_by),
    }
    return { found: true, changed: true, settled: payment }
  })

  if (settled.changed && settled.settled) {
    await writeAudit(deps.db, {
      workspaceId: settled.settled.workspaceId,
      action: 'payment.settled',
      objectType: 'payment',
      objectId: String(settled.settled.id),
      metadata: {
        number: settled.settled.number,
        plan: settled.settled.plan,
        period: settled.settled.period,
        amount: settled.settled.amount,
      },
    })
    await sendReceipt(deps, settled.settled)
  }

  if (settled.changed && !settled.settled && input.action !== 'dibayar') {
    await writeAudit(deps.db, {
      action: `payment.${input.action}`,
      objectType: 'payment',
      objectId: input.orderId,
      metadata: { orderId: input.orderId },
    })
  }

  return {
    found: settled.found,
    changed: settled.changed,
    paidWorkspaceId: settled.settled?.workspaceId ?? null,
  }
}

/**
 * Tanda terima dikirim ke pemesan. Kalau akun pemesan sudah tidak ada sehingga
 * penautannya kosong, penerimanya Owner workspace. Gagal kirim tidak
 * menggagalkan pelunasan: pembayarannya sudah sah dan tercatat.
 */
async function sendReceipt(deps: SettlementDeps, payment: SettledPayment): Promise<void> {
  const recipient = await deps.db.query<{ email: string | null; timezone: string }>(
    `select u.email, w.timezone
       from workspaces w
       left join users u on u.deleted_at is null and u.id = coalesce(
         $1::bigint,
         (select user_id from memberships
           where workspace_id = $2 and role = 'owner' and removed_at is null
           order by id limit 1)
       )
      where w.id = $2`,
    [payment.createdBy, payment.workspaceId],
  )
  const email = recipient.rows[0]?.email
  if (!email) {
    return
  }

  const periodEnd = payment.periodEnd ? new Date(payment.periodEnd) : null
  const berlaku = periodEnd
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'long',
        timeZone: recipient.rows[0]!.timezone,
      }).format(periodEnd)
    : 'tanggal berakhir belum tercatat'

  try {
    await deps.sendEmail({
      to: email,
      subject: `Pembayaran diterima: ${payment.number}`,
      body: [
        `Pembayaran tagihan ${payment.number} sebesar ${formatRupiah(payment.amount)} sudah kami terima.`,
        '',
        `Paket: ${planCatalog[payment.plan].name}, ${billingPeriodLabels[payment.period]}.`,
        `Berlaku sampai: ${berlaku}.`,
        '',
        `Faktur PDF bisa diunduh di ${deps.webOrigin}/pengaturan/paket`,
      ].join('\n'),
    })
  } catch (error) {
    deps.onError?.(error, `tanda terima ${payment.number}`)
  }
}

/** Tagihan yang lewat batas waktu tidak bisa dibayar lagi dan boleh ditutup. */
export async function expirePendingPayments(db: Database, now: Date = new Date()): Promise<number> {
  const result = await db.query(
    `update payments set status = 'kedaluwarsa' where status = 'menunggu' and expires_at <= $1`,
    [now],
  )
  return result.affected
}

export interface InvoicePayment {
  number: string
  planName: string
  periodLabel: string
  amount: number
  paymentMethodLabel: string | null
  paidAt: Date
  workspaceName: string
  payerName: string
  payerEmail: string
}

/** Data faktur satu pembayaran, lengkap dengan identitas pembeli untuk PDF. */
export async function loadPaymentForInvoice(
  db: Sql,
  workspaceId: number,
  paymentId: number,
): Promise<InvoicePayment | null> {
  const found = await db.query<{
    number: string
    plan_code: PlanCode
    billing_period: BillingPeriod
    amount: number | string
    status: PaymentStatus
    payment_method: string | null
    paid_at: Date | string | null
    workspace_name: string
    created_by: number | null
  }>(
    `select p.number, p.plan_code, p.billing_period, p.amount, p.status, p.payment_method, p.paid_at,
            p.created_by, w.name as workspace_name
       from payments p
       join workspaces w on w.id = p.workspace_id
      where p.id = $1 and p.workspace_id = $2`,
    [paymentId, workspaceId],
  )
  const row = found.rows[0]
  if (!row) {
    return null
  }
  if (row.status !== 'dibayar' || !row.paid_at) {
    throw new StockError('faktur_belum_tersedia', 'Faktur tersedia setelah pembayaran diterima.', 409)
  }

  const buyer = await db.query<{ name: string; email: string }>(
    `select name, email from users
      where deleted_at is null and id = coalesce(
        $1::bigint,
        (select user_id from memberships
          where workspace_id = $2 and role = 'owner' and removed_at is null
          order by id limit 1)
      )`,
    [row.created_by, workspaceId],
  )

  return {
    number: row.number,
    planName: planCatalog[row.plan_code].name,
    periodLabel: billingPeriodLabels[row.billing_period],
    amount: Number(row.amount),
    paymentMethodLabel: paymentMethodLabel(row.payment_method),
    paidAt: new Date(row.paid_at),
    workspaceName: row.workspace_name,
    payerName: buyer.rows[0]?.name ?? '',
    payerEmail: buyer.rows[0]?.email ?? '',
  }
}
