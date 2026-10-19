import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider } from '../src/services/email.ts'
import { flushNotificationEmails } from '../src/notifications/service.ts'
import { runDailyNotifications } from '../src/notifications/daily.ts'
import {
  cookieOf,
  registerVerifyAndLogin,
  tokenFromLastEmail,
  type CapturedEmail,
} from './account-helpers.ts'

/**
 * PRD 6.9: email dan notifikasi di dalam aplikasi untuk stok rendah, PO menunggu
 * persetujuan, keputusan PO, utang jatuh tempo, undangan, dan aktivitas keamanan
 * akun, plus ringkasan harian opsional dengan pengaturan per pengguna.
 *
 * Email diuji lewat antrean yang sama dengan produksi: pesan baru terkirim
 * setelah `flushNotificationEmails` mengambil baris yang menunggu. Karena itu
 * tes ini sekaligus membuktikan tidak ada email untuk peristiwa yang tidak
 * terjadi dan tidak ada email kedua untuk peristiwa yang sama.
 */

let db: Database
let app: FastifyInstance
let email: CapturedEmail

const ASAL_WEB = 'http://localhost:3000'
const SANDI = 'kata-sandi-pengujian-2026'

/** Tanggal kalender workspace (WIB), sama dengan yang dipakai kunci dedupe. */
const tanggalJakarta = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({ db, email, sessionSecret: 'rahasia-uji', origin: ASAL_WEB })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

beforeEach(() => {
  email.messages.length = 0
})

interface Pengguna {
  userId: number
  email: string
  cookie: string
}

async function daftar(emailAddress: string, name = 'Pemilik Usaha'): Promise<Pengguna> {
  const cookie = await registerVerifyAndLogin(app, email, emailAddress, name)
  const sesi = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })
  // Email verifikasi sudah tidak dibutuhkan setelah masuk, jadi kotaknya
  // dikosongkan supaya hitungan surat di tes ini hanya tentang notifikasi.
  email.messages.length = 0
  return { userId: sesi.json().user.id as number, email: emailAddress, cookie }
}

async function buatUsaha(pemilik: Pengguna, name: string, timezone = 'Asia/Jakarta'): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: { cookie: pemilik.cookie },
    payload: { name, businessType: 'kedai kopi', timezone },
  })
  expect(response.statusCode).toBe(201)
  return response.json().workspaceId as number
}

async function undangDanTerima(
  workspaceId: number,
  pemilik: Pengguna,
  anggota: Pengguna,
  role: 'admin' | 'purchasing' | 'staff' | 'viewer',
): Promise<void> {
  const terkirim = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/invitations`,
    headers: { cookie: pemilik.cookie },
    payload: { email: anggota.email, role },
  })
  expect(terkirim.statusCode).toBe(201)

  const diterima = await app.inject({
    method: 'POST',
    url: '/api/invitations/accept',
    headers: { cookie: anggota.cookie },
    payload: { token: tokenFromLastEmail(email) },
  })
  expect(diterima.statusCode, `penerimaan undangan ${anggota.email}`).toBe(200)

  // Notifikasi undangan untuk pengundang ikut dikuras di sini supaya tes yang
  // memakai workspace ini mulai dari antrean email yang bersih.
  await kirimEmailTertunda()
  email.messages.length = 0
}

async function buatLokasi(workspaceId: number, name = 'Gudang'): Promise<number> {
  const result = await db.query<{ id: string }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [workspaceId, name],
  )
  return Number(result.rows[0]!.id)
}

async function buatProduk(
  workspaceId: number,
  input: { sku: string; name?: string; minStock?: number | null },
): Promise<number> {
  const result = await db.query<{ id: string }>(
    `insert into products (workspace_id, sku, name, unit_code, min_stock)
     values ($1, $2, $3, 'pcs', $4) returning id`,
    [workspaceId, input.sku, input.name ?? `Barang ${input.sku}`, input.minStock ?? null],
  )
  return Number(result.rows[0]!.id)
}

async function kirimStok(
  cookie: string,
  workspaceId: number,
  body: { productId: number; locationId: number; kind: 'masuk' | 'keluar'; quantity: string },
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/stock/movements`,
    headers: { cookie },
    payload: { ...body, reasonCode: body.kind === 'masuk' ? 'saldo_awal' : 'rusak' },
  })
  expect(response.statusCode, response.body).toBe(201)
}

interface BarisNotifikasi {
  id: number
  workspace_id: number | null
  user_id: number
  kind: string
  title: string
  body: string
  in_app: boolean
  email_requested: boolean
  dedupe_key: string | null
  read_at: Date | null
  emailed_at: Date | null
}

/** Baris notifikasi langsung dari database, selalu disaring supaya tidak tercampur tes lain. */
async function notifikasi(filter: {
  kind?: string
  userId?: number
  workspaceId?: number
}): Promise<BarisNotifikasi[]> {
  const clauses: string[] = []
  const params: unknown[] = []
  if (filter.kind) {
    params.push(filter.kind)
    clauses.push(`kind = $${params.length}`)
  }
  if (filter.userId !== undefined) {
    params.push(filter.userId)
    clauses.push(`user_id = $${params.length}`)
  }
  if (filter.workspaceId !== undefined) {
    params.push(filter.workspaceId)
    clauses.push(`workspace_id = $${params.length}`)
  }
  const where = clauses.length > 0 ? `where ${clauses.join(' and ')}` : ''
  const result = await db.query<BarisNotifikasi>(
    `select id, workspace_id, user_id, kind, title, body, in_app, email_requested, dedupe_key, read_at, emailed_at
       from notifications ${where} order by id`,
    params,
  )
  return result.rows
}

/** Menjalankan pengirim email persis seperti penjadwal di server. */
async function kirimEmailTertunda(): Promise<number> {
  return flushNotificationEmails({ db, sendEmail: email.send.bind(email), webOrigin: ASAL_WEB })
}

function emailUntuk(alamat: string): Array<{ subject: string; body: string }> {
  return email.messages.filter((message) => message.to === alamat)
}

describe('stok rendah (PRD 6.2, 6.9)', () => {
  it('memberi tahu pemegang izin pembelian saat saldo pertama kali menyentuh batas minimum', async () => {
    const pemilik = await daftar('pemilik.stok.notif@contoh.test')
    const staf = await daftar('staf.stok.notif@contoh.test', 'Staf Uji')
    const workspaceId = await buatUsaha(pemilik, 'Toko Notifikasi Stok')
    await undangDanTerima(workspaceId, pemilik, staf, 'staff')

    const lokasiId = await buatLokasi(workspaceId)
    const produkId = await buatProduk(workspaceId, { sku: 'NR-1', minStock: 5 })

    await kirimStok(pemilik.cookie, workspaceId, {
      productId: produkId,
      locationId: lokasiId,
      kind: 'masuk',
      quantity: '10',
    })
    // Saldo 10 masih di atas batas 5: belum ada pemberitahuan.
    expect(await notifikasi({ kind: 'stok_rendah', workspaceId })).toHaveLength(0)

    await kirimStok(staf.cookie, workspaceId, {
      productId: produkId,
      locationId: lokasiId,
      kind: 'keluar',
      quantity: '6',
    })

    const baris = await notifikasi({ kind: 'stok_rendah', workspaceId })
    expect(baris).toHaveLength(1)
    expect(baris[0]!.user_id).toBe(pemilik.userId)
    expect(baris[0]!.title).toContain('Stok rendah')
    expect(baris[0]!.body).toContain('Sisa 4 pcs')
    expect(baris[0]!.body).toContain('batas minimum 5 pcs')
    expect(baris[0]!.dedupe_key).toBe(`stok_rendah:${produkId}:${tanggalJakarta()}`)

    // Staf tidak boleh membuat PO, jadi ia tidak menerima pemberitahuan ini.
    expect(await notifikasi({ kind: 'stok_rendah', userId: staf.userId })).toHaveLength(0)

    expect(await kirimEmailTertunda()).toBe(1)
    const surat = emailUntuk(pemilik.email)
    expect(surat).toHaveLength(1)
    expect(surat[0]!.subject).toContain('Stok rendah')

    // Turun lagi di hari yang sama tidak membuat pemberitahuan atau email kedua.
    await kirimStok(staf.cookie, workspaceId, {
      productId: produkId,
      locationId: lokasiId,
      kind: 'keluar',
      quantity: '1',
    })
    expect(await notifikasi({ kind: 'stok_rendah', workspaceId })).toHaveLength(1)
    expect(await kirimEmailTertunda()).toBe(0)
    expect(emailUntuk(pemilik.email)).toHaveLength(1)
  })

  it('menghormati kanal yang dimatikan pengguna', async () => {
    const pemilik = await daftar('pemilik.preferensi@contoh.test')
    const staf = await daftar('staf.preferensi@contoh.test', 'Staf Preferensi')
    const workspaceId = await buatUsaha(pemilik, 'Toko Preferensi')
    await undangDanTerima(workspaceId, pemilik, staf, 'staff')

    const lokasiId = await buatLokasi(workspaceId)
    const produkEmailMati = await buatProduk(workspaceId, { sku: 'NR-2', minStock: 2 })
    const produkSemuaMati = await buatProduk(workspaceId, { sku: 'NR-3', minStock: 2 })

    const matikan = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/preferences',
      headers: { cookie: pemilik.cookie },
      payload: { preferences: [{ kind: 'stok_rendah', inApp: true, email: false }] },
    })
    expect(matikan.statusCode).toBe(200)
    expect(matikan.json().preferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'stok_rendah', email: false, inApp: true }),
      ]),
    )

    await kirimStok(pemilik.cookie, workspaceId, {
      productId: produkEmailMati,
      locationId: lokasiId,
      kind: 'masuk',
      quantity: '4',
    })
    await kirimStok(staf.cookie, workspaceId, {
      productId: produkEmailMati,
      locationId: lokasiId,
      kind: 'keluar',
      quantity: '3',
    })

    const baris = await notifikasi({ kind: 'stok_rendah', userId: pemilik.userId })
    expect(baris).toHaveLength(1)
    expect(baris[0]!.email_requested).toBe(false)
    expect(baris[0]!.in_app).toBe(true)
    expect(await kirimEmailTertunda()).toBe(0)
    expect(emailUntuk(pemilik.email)).toHaveLength(0)

    // Kedua kanal mati: barisnya tidak dibuat sama sekali.
    const matikanSemua = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/preferences',
      headers: { cookie: pemilik.cookie },
      payload: { preferences: [{ kind: 'stok_rendah', inApp: false, email: false }] },
    })
    expect(matikanSemua.statusCode).toBe(200)

    await kirimStok(pemilik.cookie, workspaceId, {
      productId: produkSemuaMati,
      locationId: lokasiId,
      kind: 'masuk',
      quantity: '4',
    })
    await kirimStok(staf.cookie, workspaceId, {
      productId: produkSemuaMati,
      locationId: lokasiId,
      kind: 'keluar',
      quantity: '3',
    })

    expect(await notifikasi({ kind: 'stok_rendah', workspaceId })).toHaveLength(1)
    expect(await kirimEmailTertunda()).toBe(0)
  })

  it('tetap terkirim ke pengguna lain yang belum mematikan kanalnya', async () => {
    const pemilik = await daftar('pemilik.kanal@contoh.test')
    const admin = await daftar('admin.kanal@contoh.test', 'Admin Kanal')
    const workspaceId = await buatUsaha(pemilik, 'Toko Kanal')
    await undangDanTerima(workspaceId, pemilik, admin, 'admin')

    const lokasiId = await buatLokasi(workspaceId)
    const produkId = await buatProduk(workspaceId, { sku: 'NR-4', minStock: 2 })

    await app.inject({
      method: 'PATCH',
      url: '/api/notifications/preferences',
      headers: { cookie: pemilik.cookie },
      payload: { preferences: [{ kind: 'stok_rendah', inApp: false, email: false }] },
    })

    await kirimStok(admin.cookie, workspaceId, {
      productId: produkId,
      locationId: lokasiId,
      kind: 'masuk',
      quantity: '4',
    })
    await kirimStok(pemilik.cookie, workspaceId, {
      productId: produkId,
      locationId: lokasiId,
      kind: 'keluar',
      quantity: '3',
    })

    const baris = await notifikasi({ kind: 'stok_rendah', workspaceId })
    expect(baris).toHaveLength(1)
    expect(baris[0]!.user_id).toBe(admin.userId)
    expect(await kirimEmailTertunda()).toBe(1)
    expect(emailUntuk(admin.email)).toHaveLength(1)
  })
})

describe('purchase order (PRD 6.3, 6.9)', () => {
  interface TokoPembelian {
    pemilik: Pengguna
    admin: Pengguna
    workspaceId: number
    lokasiId: number
    supplierId: number
    produkId: number
  }

  async function siapkanPembelian(approvalRequired: boolean): Promise<TokoPembelian> {
    const pemilik = await daftar(`pemilik.po.${approvalRequired}@contoh.test`)
    const admin = await daftar(`admin.po.${approvalRequired}@contoh.test`, 'Admin Pembelian')
    const workspaceId = await buatUsaha(pemilik, 'Toko PO Notifikasi')
    await undangDanTerima(workspaceId, pemilik, admin, 'admin')

    await db.query('update workspace_settings set approval_required = $2 where workspace_id = $1', [
      workspaceId,
      approvalRequired,
    ])

    const lokasiId = await buatLokasi(workspaceId)
    const supplier = await db.query<{ id: string }>(
      'insert into suppliers (workspace_id, name) values ($1, $2) returning id',
      [workspaceId, 'CV Mitra Notifikasi'],
    )
    const produkId = await buatProduk(workspaceId, { sku: 'PO-1' })

    return {
      pemilik,
      admin,
      workspaceId,
      lokasiId,
      supplierId: Number(supplier.rows[0]!.id),
      produkId,
    }
  }

  async function buatDanAjukan(toko: TokoPembelian, cookie: string): Promise<number> {
    const dibuat = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders`,
      headers: { cookie },
      payload: {
        supplierId: toko.supplierId,
        locationId: toko.lokasiId,
        items: [{ productId: toko.produkId, quantity: '10', unitPrice: '60000' }],
      },
    })
    expect(dibuat.statusCode, dibuat.body).toBe(201)
    const orderId = dibuat.json().orderId as number

    const diajukan = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${orderId}/submit`,
      headers: { cookie },
      payload: {},
    })
    expect(diajukan.statusCode, diajukan.body).toBe(200)
    return orderId
  }

  it('mengirim PO menunggu persetujuan ke penyetuju lain dan keputusannya ke pembuat', async () => {
    const toko = await siapkanPembelian(true)

    const orderId = await buatDanAjukan(toko, toko.admin.cookie)

    const menunggu = await notifikasi({ kind: 'po_menunggu', workspaceId: toko.workspaceId })
    expect(menunggu).toHaveLength(1)
    expect(menunggu[0]!.user_id).toBe(toko.pemilik.userId)
    expect(menunggu[0]!.body).toContain('CV Mitra Notifikasi')

    const disetujui = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${orderId}/approve`,
      headers: { cookie: toko.pemilik.cookie },
      payload: {},
    })
    expect(disetujui.statusCode, disetujui.body).toBe(200)

    const keputusan = await notifikasi({ kind: 'po_disetujui', workspaceId: toko.workspaceId })
    expect(keputusan).toHaveLength(1)
    expect(keputusan[0]!.user_id).toBe(toko.admin.userId)

    const orderKedua = await buatDanAjukan(toko, toko.admin.cookie)
    const ditolak = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${toko.workspaceId}/purchase-orders/${orderKedua}/reject`,
      headers: { cookie: toko.pemilik.cookie },
      payload: { reason: 'Harga terlalu tinggi' },
    })
    expect(ditolak.statusCode, ditolak.body).toBe(200)

    const penolakan = await notifikasi({ kind: 'po_ditolak', workspaceId: toko.workspaceId })
    expect(penolakan).toHaveLength(1)
    expect(penolakan[0]!.user_id).toBe(toko.admin.userId)
    expect(penolakan[0]!.body).toContain('Harga terlalu tinggi')

    // Pembuat PO tidak diberi tahu untuk PO-nya sendiri saat menunggu persetujuan.
    expect(await notifikasi({ kind: 'po_menunggu', userId: toko.admin.userId })).toHaveLength(0)

    // Pemilik menerima dua surat menunggu persetujuan (satu per PO), admin
    // menerima keputusan untuk PO-nya sendiri.
    expect(await kirimEmailTertunda()).toBe(4)
    expect(emailUntuk(toko.pemilik.email)).toHaveLength(2)
    expect(emailUntuk(toko.pemilik.email).at(-1)?.subject).toContain('menunggu persetujuan')
    expect(emailUntuk(toko.admin.email)).toHaveLength(2)
  })
})

describe('undangan (PRD 6.1, 6.9)', () => {
  it('memberi tahu pengundang saat undangan diterima dan mencatat siapa pengundangnya', async () => {
    const pemilik = await daftar('pemilik.undangan.notif@contoh.test')
    const staf = await daftar('staf.undangan.notif@contoh.test', 'Sari Anggota')
    const workspaceId = await buatUsaha(pemilik, 'Toko Undangan')

    // Langkah undangan ditulis langsung supaya email notifikasinya masih
    // menunggu di antrean saat diperiksa di bawah.
    const terkirim = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/invitations`,
      headers: { cookie: pemilik.cookie },
      payload: { email: staf.email, role: 'staff' },
    })
    expect(terkirim.statusCode).toBe(201)

    const diterima = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      headers: { cookie: staf.cookie },
      payload: { token: tokenFromLastEmail(email) },
    })
    expect(diterima.statusCode, diterima.body).toBe(200)

    const baris = await notifikasi({ kind: 'undangan', workspaceId })
    expect(baris).toHaveLength(1)
    expect(baris[0]!.user_id).toBe(pemilik.userId)
    expect(baris[0]!.body).toContain('Sari Anggota')
    expect(baris[0]!.body).toContain('Staf')

    // Anggota yang bergabung tidak diberi tahu soal undangannya sendiri.
    expect(await notifikasi({ kind: 'undangan', userId: staf.userId })).toHaveLength(0)

    const membership = await db.query<{ invited_by: string | null }>(
      'select invited_by from memberships where workspace_id = $1 and user_id = $2',
      [workspaceId, staf.userId],
    )
    expect(Number(membership.rows[0]!.invited_by)).toBe(pemilik.userId)

    expect(await kirimEmailTertunda()).toBe(1)
    expect(emailUntuk(pemilik.email)[0]!.subject).toContain('Undangan diterima')
  })
})

describe('aktivitas keamanan akun (PRD 9, 6.9)', () => {
  it('mencatat perubahan kata sandi sebagai notifikasi akun dan membatasi daftarnya ke pemiliknya', async () => {
    const pemilik = await daftar('pemilik.keamanan@contoh.test')
    const orangLain = await daftar('orang.lain@contoh.test')
    const workspaceId = await buatUsaha(pemilik, 'Toko Keamanan')
    const workspaceKedua = await buatUsaha(pemilik, 'Toko Kedua')
    const workspaceOrangLain = await buatUsaha(orangLain, 'Toko Lain')

    const ganti = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: pemilik.cookie },
      payload: { currentPassword: SANDI, newPassword: 'kata-sandi-baru-2026-panjang' },
    })
    expect(ganti.statusCode, ganti.body).toBe(200)
    const cookie = cookieOf(ganti)

    const baris = await notifikasi({ kind: 'keamanan' })
    expect(baris).toHaveLength(1)
    expect(baris[0]!.user_id).toBe(pemilik.userId)
    // Notifikasi akun tidak melekat pada workspace mana pun.
    expect(baris[0]!.workspace_id).toBeNull()

    const daftarSendiri = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/notifications`,
      headers: { cookie },
    })
    expect(daftarSendiri.statusCode).toBe(200)
    expect(daftarSendiri.json().notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'keamanan', kindLabel: 'Keamanan akun' }),
      ]),
    )
    expect(daftarSendiri.json().unreadCount).toBe(1)

    // Notifikasi akun muncul juga saat pengguna membuka usaha keduanya.
    const diUsahaKedua = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceKedua}/notifications/unread-count`,
      headers: { cookie },
    })
    expect(diUsahaKedua.statusCode).toBe(200)
    expect(diUsahaKedua.json().unreadCount).toBe(1)

    // Daftar pengguna lain diusahanya sendiri tetap kosong.
    const daftarOrangLain = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceOrangLain}/notifications`,
      headers: { cookie: orangLain.cookie },
    })
    expect(daftarOrangLain.statusCode).toBe(200)
    expect(daftarOrangLain.json().notifications).toHaveLength(0)

    // Pengguna lain tidak bisa membaca daftar workspace yang bukan miliknya.
    const ditolak = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/notifications`,
      headers: { cookie: orangLain.cookie },
    })
    expect(ditolak.statusCode).toBe(403)

    const hanyaBelumDibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/notifications?unread=1`,
      headers: { cookie },
    })
    expect(hanyaBelumDibaca.json().notifications).toHaveLength(1)

    const tandai = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/notifications/read-all`,
      headers: { cookie },
    })
    expect(tandai.statusCode).toBe(200)
    expect(tandai.json().marked).toBe(1)

    const setelahDibaca = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/notifications?unread=1`,
      headers: { cookie },
    })
    expect(setelahDibaca.json().notifications).toHaveLength(0)
    expect(setelahDibaca.json().unreadCount).toBe(0)

    expect(await kirimEmailTertunda()).toBe(1)
    expect(emailUntuk(pemilik.email)[0]!.subject).toContain('Kata sandi diubah')
  })
})

describe('tugas harian (PRD 6.9)', () => {
  it('mengingatkan utang jatuh tempo dan mengirim ringkasan harian sekali per hari', async () => {
    const pemilik = await daftar('pemilik.harian@contoh.test')
    const workspaceId = await buatUsaha(pemilik, 'Toko Harian')

    // Utang supplier ikut paket berbayar (PRD 16), jadi paketnya dinaikkan.
    await db.query(`update workspace_subscriptions set plan_code = 'usaha' where workspace_id = $1`, [
      workspaceId,
    ])

    const supplier = await db.query<{ id: string }>(
      `insert into suppliers (workspace_id, name, payment_term_days)
       values ($1, 'CV Jatuh Tempo', 30) returning id`,
      [workspaceId],
    )
    await db.query(
      `insert into supplier_debt_entries (workspace_id, supplier_id, amount, entry_date)
       values ($1, $2, 1500000, current_date - 60)`,
      [workspaceId, Number(supplier.rows[0]!.id)],
    )

    const pagi = new Date()
    pagi.setUTCHours(1, 0, 0, 0) // pukul 8 pagi WIB.

    const pertama = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: ASAL_WEB },
      pagi,
    )
    expect(pertama.debtWorkspaces).toBe(1)

    const utang = await notifikasi({ kind: 'utang_jatuh_tempo', workspaceId })
    expect(utang).toHaveLength(1)
    expect(utang[0]!.user_id).toBe(pemilik.userId)
    expect(utang[0]!.body).toContain('CV Jatuh Tempo')
    expect(utang[0]!.body).toContain('Rp1.500.000')

    // Dijalankan lagi di hari yang sama: tidak ada baris atau email kedua.
    const kedua = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: ASAL_WEB },
      pagi,
    )
    expect(kedua.debtWorkspaces).toBe(0)
    expect(await notifikasi({ kind: 'utang_jatuh_tempo', workspaceId })).toHaveLength(1)

    expect(await kirimEmailTertunda()).toBe(1)
    expect(emailUntuk(pemilik.email)[0]!.subject).toContain('Utang supplier jatuh tempo')

    // Ringkasan harian opsional: menyala setelah diaktifkan sendiri.
    const aktifkan = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/preferences',
      headers: { cookie: pemilik.cookie },
      payload: { digestEnabled: true },
    })
    expect(aktifkan.statusCode).toBe(200)
    expect(aktifkan.json().digestEnabled).toBe(true)

    const ringkasan = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: ASAL_WEB },
      pagi,
    )
    expect(ringkasan.digestsSent).toBe(1)

    const suratRingkasan = emailUntuk(pemilik.email).filter((message) =>
      message.subject.startsWith('Ringkasan harian'),
    )
    expect(suratRingkasan).toHaveLength(1)
    expect(suratRingkasan[0]!.body).toContain('Utang supplier jatuh tempo')

    const ringkasanKedua = await runDailyNotifications(
      { db, sendEmail: email.send.bind(email), webOrigin: ASAL_WEB },
      pagi,
    )
    expect(ringkasanKedua.digestsSent).toBe(0)
    expect(
      emailUntuk(pemilik.email).filter((message) => message.subject.startsWith('Ringkasan harian')),
    ).toHaveLength(1)
  })
})
