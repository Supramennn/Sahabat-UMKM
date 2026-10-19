import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { hashPassword } from '../src/auth/password.ts'
import { runDailyNotifications } from '../src/notifications/daily.ts'
import type { BillingConfig } from '../src/plans/billing.ts'
import {
  createMidtransGateway,
  midtransAction,
  midtransSignature,
  type PaymentGateway,
  type PaymentTransactionRequest,
} from '../src/services/payment-gateway.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import { login, registerVerifyAndLogin, TEST_PASSWORD, type CapturedEmail } from './account-helpers.ts'

const SERVER_KEY = 'kunci-uji-pembayaran'

const billingEnabled: BillingConfig = {
  enabled: true,
  simulation: false,
  sandbox: true,
  serverKey: SERVER_KEY,
  seller: {
    name: 'PT Uji Sahabat',
    address: 'Jalan Uji 1',
    email: 'penjual@contoh.test',
    taxId: null,
    timeZone: 'Asia/Jakarta',
  },
  refundPolicyUrl: 'https://contoh.test/kebijakan-refund',
}

interface FakeGateway extends PaymentGateway {
  calls: PaymentTransactionRequest[]
  failWith: string | null
}

function createFakeGateway(): FakeGateway {
  const gateway: FakeGateway = {
    calls: [],
    failWith: null,
    async createTransaction(request) {
      if (gateway.failWith) {
        throw new Error(gateway.failWith)
      }
      gateway.calls.push(request)
      return { token: `token-${gateway.calls.length}`, redirectUrl: `https://pembayaran.contoh.test/${request.orderId}` }
    },
  }
  return gateway
}

describe('Gateway Midtrans (unit)', () => {
  it('mengirim permintaan Snap ke sandbox dengan kunci server dan mengembalikan tautan', async () => {
    const panggilan: { url: string; init: RequestInit }[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      panggilan.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ token: 'abc', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/abc' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const gateway = createMidtransGateway({ serverKey: SERVER_KEY, sandbox: true, fetchImpl })
    const hasil = await gateway.createTransaction({
      orderId: 'SU-1-abcd',
      amount: 99000,
      itemName: 'Paket Usaha, 1 bulan',
      payerName: 'Pemilik',
      payerEmail: 'pemilik@contoh.test',
      finishUrl: 'http://localhost:3000/pengaturan/paket?payment=1',
    })

    expect(hasil.redirectUrl).toContain('/snap/v4/redirection/abc')
    expect(panggilan[0]!.url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions')
    const headers = panggilan[0]!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`)
    const body = JSON.parse(String(panggilan[0]!.init.body)) as { transaction_details: { order_id: string; gross_amount: number } }
    expect(body.transaction_details).toMatchObject({ order_id: 'SU-1-abcd', gross_amount: 99000 })
  })

  it('menolak respons tanpa tautan dan status HTTP yang gagal', async () => {
    const tanpaTautan = createMidtransGateway({
      serverKey: SERVER_KEY,
      sandbox: false,
      fetchImpl: async () => new Response('{}', { status: 201 }),
    })
    await expect(
      tanpaTautan.createTransaction({
        orderId: 'SU-1', amount: 1000, itemName: 'x', payerName: 'a', payerEmail: 'a@contoh.test', finishUrl: 'http://localhost:3000',
      }),
    ).rejects.toThrow('tautan pembayaran')

    const ditolak = createMidtransGateway({
      serverKey: SERVER_KEY,
      sandbox: false,
      fetchImpl: async () => new Response('isi rahasia', { status: 401 }),
    })
    await expect(
      ditolak.createTransaction({
        orderId: 'SU-1', amount: 1000, itemName: 'x', payerName: 'a', payerEmail: 'a@contoh.test', finishUrl: 'http://localhost:3000',
      }),
    ).rejects.toThrow('HTTP 401')
  })

  it('memetakan status Midtrans ke tindakan yang benar', () => {
    expect(midtransAction('settlement', null)).toBe('dibayar')
    expect(midtransAction('capture', 'accept')).toBe('dibayar')
    expect(midtransAction('capture', 'challenge')).toBe('abaikan')
    expect(midtransAction('capture', 'deny')).toBe('gagal')
    expect(midtransAction('pending', null)).toBe('abaikan')
    expect(midtransAction('deny', null)).toBe('gagal')
    expect(midtransAction('cancel', null)).toBe('gagal')
    expect(midtransAction('expire', null)).toBe('kedaluwarsa')
    expect(midtransAction('refund', null)).toBe('abaikan')
  })
})

let db: Database
let app: FastifyInstance
let appTanpaPenagihan: FastifyInstance
let email: CapturedEmail
let gateway: FakeGateway
let seq = 0
let passwordHash = ''

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  gateway = createFakeGateway()
  app = await buildApp({
    db,
    email,
    sessionSecret: 'rahasia-uji',
    origin: 'http://localhost:3000',
    billing: billingEnabled,
    paymentGateway: gateway,
  })
  appTanpaPenagihan = await buildApp({
    db,
    email,
    sessionSecret: 'rahasia-uji',
    origin: 'http://localhost:3000',
    billing: { ...billingEnabled, enabled: false, serverKey: null, refundPolicyUrl: null },
    paymentGateway: null,
  })
  await app.ready()
  await appTanpaPenagihan.ready()
  passwordHash = await hashPassword(TEST_PASSWORD)
})

afterAll(async () => {
  await app.close()
  await appTanpaPenagihan.close()
  await closeTestDatabase(db)
})

async function workspace(): Promise<{ id: number; cookie: string; name: string }> {
  seq += 1
  const address = `tagihan-${seq}@contoh.test`
  const cookie = await registerVerifyAndLogin(app, email, address)
  const name = `Toko Tagihan ${seq}`
  const created = await app.inject({
    method: 'POST', url: '/api/workspaces', headers: { cookie },
    payload: { name, timezone: 'Asia/Jakarta' },
  })
  expect(created.statusCode).toBe(201)
  return { id: created.json().workspaceId as number, cookie, name }
}

async function checkout(
  toko: { id: number; cookie: string },
  body: { plan: 'usaha' | 'bisnis'; period: 'bulanan' | 'tahunan' },
  target: FastifyInstance = app,
) {
  return target.inject({
    method: 'POST',
    url: `/api/workspaces/${toko.id}/subscription/checkout`,
    headers: { cookie: toko.cookie },
    payload: body,
  })
}

async function orderIdOf(paymentId: number): Promise<string> {
  const row = await db.query<{ provider_order_id: string }>(
    'select provider_order_id from payments where id = $1',
    [paymentId],
  )
  return row.rows[0]!.provider_order_id
}

/** Notifikasi Midtrans yang sah, dipakai tes untuk menandai tagihan lunas. */
async function notify(
  orderId: string,
  transactionStatus: string,
  options: { amount?: string; serverKey?: string; fraudStatus?: string; paymentType?: string } = {},
) {
  const grossAmount = options.amount ?? '99000.00'
  return app.inject({
    method: 'POST',
    url: '/api/payments/midtrans/notification',
    payload: {
      order_id: orderId,
      status_code: '200',
      gross_amount: grossAmount,
      signature_key: midtransSignature({
        orderId,
        statusCode: '200',
        grossAmount,
        serverKey: options.serverKey ?? SERVER_KEY,
      }),
      transaction_status: transactionStatus,
      fraud_status: options.fraudStatus ?? 'accept',
      payment_type: options.paymentType ?? 'qris',
      transaction_id: `trx-${orderId}`,
    },
  })
}

describe('Penagihan langganan (PRD 6.10)', () => {
  it('menyembunyikan penagihan saat konfigurasi belum lengkap', async () => {
    const toko = await workspace()
    const info = await appTanpaPenagihan.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.statusCode).toBe(200)
    expect(info.json().billingEnabled).toBe(false)
    expect(info.json().billing.refundPolicyUrl).toBeNull()

    const hasil = await checkout(toko, { plan: 'usaha', period: 'bulanan' }, appTanpaPenagihan)
    expect(hasil.statusCode).toBe(409)
    expect(hasil.json().error).toBe('pembayaran_belum_aktif')
  })

  it('membuat tagihan dengan nomor, nominal katalog, dan tautan gateway', async () => {
    const toko = await workspace()
    const hasil = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    expect(hasil.statusCode).toBe(201)
    const payment = hasil.json().payment
    expect(payment.number).toMatch(/^INV-\d{4}-\d{5}$/)
    expect(payment).toMatchObject({ plan: 'usaha', planName: 'Usaha', periodLabel: 'Bulanan', amount: 99000, status: 'menunggu' })
    expect(payment.redirectUrl).toContain('https://pembayaran.contoh.test/')
    expect(gateway.calls.at(-1)!.itemName).toBe('Paket Usaha, 1 bulan')

    const orderId = await orderIdOf(payment.id as number)
    expect(gateway.calls.at(-1)!.orderId).toBe(orderId)
    expect(gateway.calls.at(-1)!.finishUrl).toContain(`/pengaturan/paket?payment=${payment.id as number}`)

    const audit = await db.query<{ action: string }>(
      `select action from audit_logs where workspace_id = $1 and action = 'payment.created'`,
      [toko.id],
    )
    expect(audit.rows).toHaveLength(1)

    // Belum ada pembayaran: paket workspace tidak berubah.
    const info = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.json().subscription.plan).toBe('gratis')
  })

  it('menagih paket tahunan setara sepuluh bulan', async () => {
    const toko = await workspace()
    const hasil = await checkout(toko, { plan: 'bisnis', period: 'tahunan' })
    expect(hasil.statusCode).toBe(201)
    expect(hasil.json().payment.amount).toBe(249000 * 10)
  })

  it('menolak penurunan paket yang melewati batas sebelum tagihan dibuat', async () => {
    const toko = await workspace()
    const trial = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'bisnis' },
    })
    expect(trial.statusCode).toBe(200)
    for (const nama of ['Gudang A', 'Gudang B', 'Gudang C']) {
      const lokasi = await app.inject({
        method: 'POST', url: `/api/workspaces/${toko.id}/locations`, headers: { cookie: toko.cookie },
        payload: { name: nama },
      })
      expect(lokasi.statusCode).toBe(201)
    }

    const hasil = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    expect(hasil.statusCode).toBe(409)
    expect(hasil.json().error).toBe('batas_paket')
    expect(hasil.json().message).toContain('lokasi')

    const rows = await db.query('select id from payments where workspace_id = $1', [toko.id])
    expect(rows.rows).toHaveLength(0)
  })

  it('menolak checkout dari luar workspace dan dari anggota non-Owner', async () => {
    const toko = await workspace()
    const outsiderAddress = `tagihan-luar-${seq}@contoh.test`
    const outsider = await registerVerifyAndLogin(app, email, outsiderAddress)
    const luar = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/checkout`, headers: { cookie: outsider },
      payload: { plan: 'usaha', period: 'bulanan' },
    })
    expect(luar.statusCode).toBe(403)

    seq += 1
    const staffEmail = `tagihan-staf-${seq}@contoh.test`
    const staff = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, $2, 'Staf', now()) returning id`,
      [staffEmail, passwordHash],
    )
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      toko.id, staff.rows[0]!.id, 'staff',
    ])
    const staffCookie = await login(app, staffEmail)

    const dariStaf = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/checkout`, headers: { cookie: staffCookie },
      payload: { plan: 'usaha', period: 'bulanan' },
    })
    expect(dariStaf.statusCode).toBe(403)

    const riwayatStaf = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription/payments`, headers: { cookie: staffCookie },
    })
    expect(riwayatStaf.statusCode).toBe(403)
  })

  it('menolak notifikasi dengan tanda tangan yang tidak cocok', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const paymentId = dibuat.json().payment.id as number
    const orderId = await orderIdOf(paymentId)

    const palsu = await notify(orderId, 'settlement', { serverKey: 'kunci-yang-salah' })
    expect(palsu.statusCode).toBe(401)

    const row = await db.query<{ status: string }>('select status from payments where id = $1', [paymentId])
    expect(row.rows[0]!.status).toBe('menunggu')
  })

  it('melunasi tagihan, mengaktifkan langganan, dan mengirim tanda terima', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const paymentId = dibuat.json().payment.id as number
    const orderId = await orderIdOf(paymentId)
    email.messages.length = 0

    const notifikasi = await notify(orderId, 'settlement')
    expect(notifikasi.statusCode).toBe(200)
    expect(notifikasi.json()).toMatchObject({ received: true, action: 'dibayar' })

    const payment = await db.query<{ status: string; paid_at: Date; payment_method: string }>(
      'select status, paid_at, payment_method from payments where id = $1', [paymentId],
    )
    expect(payment.rows[0]).toMatchObject({ status: 'dibayar', payment_method: 'qris' })
    expect(payment.rows[0]!.paid_at).toBeInstanceOf(Date)

    const subscription = await db.query<{
      plan_code: string
      status: string
      current_period_end: Date
      billing_period: string
      trial_ends_at: Date | null
    }>(
      `select plan_code, status, current_period_end, billing_period, trial_ends_at
         from workspace_subscriptions where workspace_id = $1`,
      [toko.id],
    )
    const langganan = subscription.rows[0]!
    expect(langganan).toMatchObject({ plan_code: 'usaha', status: 'aktif', billing_period: 'bulanan', trial_ends_at: null })
    const sisaHari = (langganan.current_period_end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(sisaHari).toBeGreaterThan(27)
    expect(sisaHari).toBeLessThan(32)

    const info = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.json().subscription).toMatchObject({ plan: 'usaha', status: 'aktif', billingPeriod: 'bulanan' })
    expect(info.json().subscription.currentPeriodEnd).not.toBeNull()

    const tandaTerima = email.messages.filter((message) => message.subject.startsWith('Pembayaran diterima'))
    expect(tandaTerima).toHaveLength(1)
    expect(tandaTerima[0]!.body).toContain('99.000')
    expect(tandaTerima[0]!.body).toContain('Paket: Usaha, Bulanan.')

    const audit = await db.query<{ action: string }>(
      `select action from audit_logs where workspace_id = $1 and action = 'payment.settled'`,
      [toko.id],
    )
    expect(audit.rows).toHaveLength(1)
  })

  it('tidak memperpanjang dua kali saat notifikasi datang berulang', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const orderId = await orderIdOf(dibuat.json().payment.id as number)

    expect((await notify(orderId, 'settlement')).statusCode).toBe(200)
    const pertama = await db.query<{ current_period_end: Date }>(
      'select current_period_end from workspace_subscriptions where workspace_id = $1', [toko.id],
    )
    email.messages.length = 0

    const ulang = await notify(orderId, 'settlement')
    expect(ulang.statusCode).toBe(200)

    const kedua = await db.query<{ current_period_end: Date }>(
      'select current_period_end from workspace_subscriptions where workspace_id = $1', [toko.id],
    )
    expect(kedua.rows[0]!.current_period_end.getTime()).toBe(pertama.rows[0]!.current_period_end.getTime())
    expect(email.messages.filter((message) => message.subject.startsWith('Pembayaran diterima'))).toHaveLength(0)
  })

  it('menolak notifikasi dengan nominal yang berbeda dari tagihan', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const paymentId = dibuat.json().payment.id as number
    const orderId = await orderIdOf(paymentId)

    const salah = await notify(orderId, 'settlement', { amount: '1000.00' })
    expect(salah.statusCode).toBe(400)

    const row = await db.query<{ status: string }>('select status from payments where id = $1', [paymentId])
    expect(row.rows[0]!.status).toBe('menunggu')
    const info = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.json().subscription.plan).toBe('gratis')
  })

  it('mencatat pembayaran yang gagal dan yang kedaluwarsa tanpa mengaktifkan paket', async () => {
    const toko = await workspace()
    const gagal = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const gagalId = gagal.json().payment.id as number

    expect((await notify(await orderIdOf(gagalId), 'deny')).statusCode).toBe(200)
    const statusGagal = await db.query<{ status: string }>('select status from payments where id = $1', [gagalId])
    expect(statusGagal.rows[0]!.status).toBe('gagal')

    const kedaluwarsa = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const kedaluwarsaId = kedaluwarsa.json().payment.id as number
    expect((await notify(await orderIdOf(kedaluwarsaId), 'expire')).statusCode).toBe(200)
    const statusKedaluwarsa = await db.query<{ status: string }>('select status from payments where id = $1', [kedaluwarsaId])
    expect(statusKedaluwarsa.rows[0]!.status).toBe('kedaluwarsa')

    const info = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.json().subscription.plan).toBe('gratis')
  })

  it('menumpuk perpanjangan di atas masa berjalan yang belum habis', async () => {
    const toko = await workspace()
    const pertama = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    expect((await notify(await orderIdOf(pertama.json().payment.id as number), 'settlement')).statusCode).toBe(200)
    const awal = await db.query<{ current_period_end: Date }>(
      'select current_period_end from workspace_subscriptions where workspace_id = $1', [toko.id],
    )

    const kedua = await checkout(toko, { plan: 'bisnis', period: 'bulanan' })
    expect(kedua.statusCode).toBe(201)
    const notifikasiKedua = await notify(await orderIdOf(kedua.json().payment.id as number), 'settlement', {
      amount: '249000.00',
    })
    expect(notifikasiKedua.statusCode).toBe(200)

    const akhir = await db.query<{ plan_code: string; current_period_end: Date }>(
      'select plan_code, current_period_end from workspace_subscriptions where workspace_id = $1', [toko.id],
    )
    expect(akhir.rows[0]!.plan_code).toBe('bisnis')
    const tambahanHari = (akhir.rows[0]!.current_period_end.getTime() - awal.rows[0]!.current_period_end.getTime()) / (24 * 60 * 60 * 1000)
    expect(tambahanHari).toBeGreaterThan(27)
    expect(tambahanHari).toBeLessThan(32)
  })

  it('menutup tagihan yang lewat batas waktu pada tugas harian', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const paymentId = dibuat.json().payment.id as number
    await db.query(`update payments set expires_at = now() - interval '1 minute' where id = $1`, [paymentId])

    const hasil = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: 'http://localhost:3000' },
      new Date(),
    )
    expect(hasil.expiredPayments).toBeGreaterThanOrEqual(1)

    const row = await db.query<{ status: string }>('select status from payments where id = $1', [paymentId])
    expect(row.rows[0]!.status).toBe('kedaluwarsa')
  })

  it('mengirim pengingat perpanjangan sekali untuk tujuh hari dan sekali untuk satu hari', async () => {
    const toko = await workspace()
    const trial = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/subscription/plan`, headers: { cookie: toko.cookie },
      payload: { plan: 'usaha' },
    })
    expect(trial.statusCode).toBe(200)

    const now = new Date()
    const deps = { db, sendEmail: email.send.bind(email), webOrigin: 'http://localhost:3000' }
    const sehari = 24 * 60 * 60 * 1000

    await db.query(
      `update workspace_subscriptions set trial_ends_at = $2 where workspace_id = $1`,
      [toko.id, new Date(now.getTime() + 7 * sehari - 60_000)],
    )
    email.messages.length = 0
    expect((await runDailyNotifications(deps, now)).renewalReminders).toBe(1)
    expect(email.messages).toHaveLength(1)
    expect(email.messages[0]!.subject).toBe('Uji coba paket Usaha berakhir dalam 7 hari')
    expect(email.messages[0]!.body).toContain(`usaha ${toko.name}`)
    // Menjalankan tugas lagi di hari yang sama tidak mengirim surat kedua.
    expect((await runDailyNotifications(deps, now)).renewalReminders).toBe(0)
    expect(email.messages).toHaveLength(1)

    await db.query(
      `update workspace_subscriptions set trial_ends_at = $2 where workspace_id = $1`,
      [toko.id, new Date(now.getTime() + sehari - 60_000)],
    )
    expect((await runDailyNotifications(deps, now)).renewalReminders).toBe(1)
    expect(email.messages).toHaveLength(2)
    expect(email.messages[1]!.subject).toBe('Uji coba paket Usaha berakhir dalam 1 hari')
    expect((await runDailyNotifications(deps, now)).renewalReminders).toBe(0)
  })

  it('mengingatkan perpanjangan langganan berbayar yang akan berakhir', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    expect((await notify(await orderIdOf(dibuat.json().payment.id as number), 'settlement')).statusCode).toBe(200)

    const now = new Date()
    await db.query(
      `update workspace_subscriptions
          set current_period_end = $2, renewal_reminder_7d_at = null, renewal_reminder_1d_at = null
        where workspace_id = $1`,
      [toko.id, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 - 60_000)],
    )
    email.messages.length = 0

    const hasil = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: 'http://localhost:3000' },
      now,
    )
    expect(hasil.renewalReminders).toBe(1)
    expect(email.messages[0]!.subject).toBe('Langganan paket Usaha berakhir dalam 7 hari')
  })

  it('menyediakan faktur PDF hanya setelah lunas, dan hanya untuk Owner', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    const paymentId = dibuat.json().payment.id as number
    const number = dibuat.json().payment.number as string

    const belum = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.id}/subscription/payments/${paymentId}/invoice.pdf`,
      headers: { cookie: toko.cookie },
    })
    expect(belum.statusCode).toBe(409)
    expect(belum.json().error).toBe('faktur_belum_tersedia')

    expect((await notify(await orderIdOf(paymentId), 'settlement')).statusCode).toBe(200)

    const faktur = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.id}/subscription/payments/${paymentId}/invoice.pdf`,
      headers: { cookie: toko.cookie },
    })
    expect(faktur.statusCode).toBe(200)
    expect(faktur.headers['content-type']).toContain('application/pdf')
    expect(faktur.headers['content-disposition']).toContain(`${number}.pdf`)
    expect(faktur.rawPayload.subarray(0, 4).toString('utf8')).toBe('%PDF')
    expect(faktur.rawPayload.length).toBeGreaterThan(1000)

    const daftar = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription/payments`, headers: { cookie: toko.cookie },
    })
    expect(daftar.statusCode).toBe(200)
    expect(daftar.json().payments[0]).toMatchObject({ number, status: 'dibayar', paymentMethodLabel: 'QRIS' })

    const outsiderAddress = `tagihan-luar-faktur-${seq}@contoh.test`
    const outsider = await registerVerifyAndLogin(app, email, outsiderAddress)
    const luar = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.id}/subscription/payments/${paymentId}/invoice.pdf`,
      headers: { cookie: outsider },
    })
    expect(luar.statusCode).toBe(403)

    const tidakAda = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${toko.id}/subscription/payments/999999/invoice.pdf`,
      headers: { cookie: toko.cookie },
    })
    expect(tidakAda.statusCode).toBe(404)
  })

  it('menurunkan paket ke Gratis setelah masa berbayar lewat, tanpa menghapus data', async () => {
    const toko = await workspace()
    const dibuat = await checkout(toko, { plan: 'usaha', period: 'bulanan' })
    expect((await notify(await orderIdOf(dibuat.json().payment.id as number), 'settlement')).statusCode).toBe(200)

    const produk = await app.inject({
      method: 'POST', url: `/api/workspaces/${toko.id}/products`, headers: { cookie: toko.cookie },
      payload: { sku: 'LAMA-1', name: 'Barang Lama', unitCode: 'pcs' },
    })
    expect(produk.statusCode).toBe(201)

    await db.query(
      `update workspace_subscriptions set current_period_end = now() - interval '1 second' where workspace_id = $1`,
      [toko.id],
    )

    const info = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/subscription`, headers: { cookie: toko.cookie },
    })
    expect(info.json().subscription).toMatchObject({ plan: 'gratis', status: 'aktif', currentPeriodEnd: null, billingPeriod: null })

    const row = await db.query<{ billing_period: string | null }>(
      'select billing_period from workspace_subscriptions where workspace_id = $1', [toko.id],
    )
    expect(row.rows[0]!.billing_period).toBeNull()

    // Data tetap terbaca dan produk lama tidak dihapus.
    const daftar = await app.inject({
      method: 'GET', url: `/api/workspaces/${toko.id}/products`, headers: { cookie: toko.cookie },
    })
    expect(daftar.statusCode).toBe(200)
    expect(daftar.json().products.some((item: { sku: string }) => item.sku === 'LAMA-1')).toBe(true)
  })
})
