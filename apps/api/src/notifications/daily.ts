import type { Database } from '@sahabat/db'
import { fileDateStamp, formatRupiah, planCatalog, type PlanCode } from '@sahabat/shared'
import type { EmailMessage } from '../auth/routes.ts'
import { expirePendingPayments } from '../plans/billing-service.ts'
import { readEffectivePlan } from '../plans/service.ts'
import { createReport } from '../reports/service.ts'
import { recipientsFor } from './hooks.ts'
import { createNotifications, flushNotificationEmails, type NotificationSenderDeps } from './service.ts'

/**
 * Tugas harian notifikasi PRD 6.9: utang supplier yang sudah lewat jatuh tempo
 * dan ringkasan harian opsional, ditambah pengingat perpanjangan langganan
 * (PRD 6.10) dan penutupan tagihan yang lewat waktu.
 *
 * Keduanya dijalankan dari penjadwal dalam proses (`startNotificationScheduler`)
 * karena server ini tidak memakai worker terpisah. KEPUTUSAN-TEKNIS mencatat
 * pg-boss sebagai rencana untuk antrean impor, ekspor, dan email; begitu pg-boss
 * dipasang, isi berkas ini yang dipindahkan menjadi job, bukan ditulis ulang.
 *
 * Semua fungsi menerima `now` supaya perilakunya bisa diuji pada jam tertentu
 * tanpa menunggu jam sungguhan. Pemeriksaan tanggal memakai zona waktu
 * workspace, jadi "hari ini" sama dengan hari yang dilihat pemiliknya (B-10).
 */

/** Ringkasan harian dikirim setelah pukul 7 pagi waktu workspace. */
const DIGEST_HOUR = 7

/** Batas isi ringkasan supaya suratnya tetap terbaca. */
const DIGEST_MAX_ITEMS = 20

export interface DailyNotificationDeps {
  db: Database
  sendEmail: (message: EmailMessage) => Promise<void>
  webOrigin: string
  onError?: (error: unknown, context: string) => void
}

export interface DailyNotificationResult {
  debtWorkspaces: number
  renewalReminders: number
  digestsSent: number
  expiredPayments: number
}

function zonedClock(date: Date, timeZone: string): { date: string; hour: number } {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return { date: fileDateStamp(date, timeZone), hour: Number.parseInt(hour, 10) }
}

/**
 * Utang jatuh tempo memberi tahu pemegang laporan utang sekali sehari per
 * workspace, bukan sekali per supplier: satu surat berisi daftar supplier yang
 * lewat jatuh tempo lebih mudah ditindaklanjuti daripada sepuluh surat terpisah.
 * Isinya memakai laporan utang yang sudah teruji supaya angkanya sama dengan
 * dashboard dan halaman laporan.
 */
async function notifyOverdueDebts(deps: DailyNotificationDeps, now: Date): Promise<number> {
  const workspaces = await deps.db.query<{ id: string; timezone: string }>(
    'select id, timezone from workspaces where deleted_at is null',
  )

  let notified = 0
  for (const workspace of workspaces.rows) {
    const workspaceId = Number(workspace.id)

    // Utang supplier adalah bagian paket berbayar (PRD 16). Workspace paket
    // Gratis tidak menerima laporan utang, jadi tidak menerima suratnya juga.
    const plan = await readEffectivePlan(deps.db, workspaceId)
    if (!planCatalog[plan].returns) {
      continue
    }

    const recipients = await recipientsFor(deps.db, workspaceId, 'reports.debt')
    if (recipients.length === 0) {
      continue
    }

    const laporan = await createReport(deps.db, workspaceId, 'debts', {})
    const overdue = (
      laporan.rows as Array<{
        supplier: string
        dueOn: string | null
        outstanding: number
        overdueDays: number | null
      }>
    ).filter((row) => (row.overdueDays ?? 0) > 0)
    if (overdue.length === 0) {
      continue
    }

    const total = overdue.reduce((sum, row) => sum + row.outstanding, 0)
    const daftar = overdue
      .slice(0, 5)
      .map((row) => `- ${row.supplier}: ${formatRupiah(row.outstanding)}, lewat ${row.overdueDays} hari`)
    if (overdue.length > 5) {
      daftar.push(`- dan ${overdue.length - 5} supplier lain`)
    }

    const dibuat = await createNotifications(
      deps.db,
      recipients.map((userId) => ({
        workspaceId,
        userId,
        kind: 'utang_jatuh_tempo' as const,
        title: 'Utang supplier jatuh tempo',
        body:
          `${overdue.length} supplier sudah melewati jatuh tempo dengan sisa utang ${formatRupiah(total)}.\n` +
          daftar.join('\n'),
        href: '/pembelian/pembayaran',
        dedupeKey: `utang_jatuh_tempo:${workspaceId}:${fileDateStamp(now, workspace.timezone)}`,
      })),
    )
    // Dihitung dari baris yang benar-benar dibuat, jadi menjalankan tugas dua
    // kali di hari yang sama terlihat sebagai nol, bukan dua.
    if (dibuat > 0) {
      notified += 1
    }
  }

  return notified
}

interface DigestUserRow {
  user_id: string
  email: string
  name: string
  last_digest_at: Date | string | null
  timezone: string | null
}

/**
 * Ringkasan harian dikirim sekali sehari per pengguna, memakai zona waktu
 * workspace pertama yang ia ikuti supaya jam kirimnya masuk akal tanpa
 * pengaturan jam per pengguna (belum ada di PRD).
 */
async function sendDailyDigests(deps: DailyNotificationDeps, now: Date): Promise<number> {
  const users = await deps.db.query<DigestUserRow>(
    `select d.user_id, d.last_digest_at, u.email, u.name,
            (select w.timezone from memberships m
               join workspaces w on w.id = m.workspace_id
              where m.user_id = d.user_id and m.removed_at is null and w.deleted_at is null
              order by m.created_at, m.id
              limit 1) as timezone
       from notification_digest_settings d
       join users u on u.id = d.user_id
      where d.enabled and u.deleted_at is null`,
  )

  let sent = 0
  for (const user of users.rows) {
    if (!user.timezone) {
      continue
    }

    const clock = zonedClock(now, user.timezone)
    if (clock.hour < DIGEST_HOUR) {
      continue
    }
    if (
      user.last_digest_at &&
      fileDateStamp(new Date(user.last_digest_at), user.timezone) === clock.date
    ) {
      continue
    }

    const windowStart = user.last_digest_at ? new Date(user.last_digest_at) : null
    const params = [Number(user.user_id), windowStart]
    const count = await deps.db.query<{ count: number }>(
      `select count(*)::int as count from notifications
        where user_id = $1 and email_requested
          and created_at > coalesce($2::timestamptz, now() - interval '24 hours')`,
      params,
    )
    const total = count.rows[0]?.count ?? 0
    if (total === 0) {
      continue
    }

    const items = await deps.db.query<{ title: string; body: string }>(
      `select title, body from notifications
        where user_id = $1 and email_requested
          and created_at > coalesce($2::timestamptz, now() - interval '24 hours')
        order by created_at desc, id desc
        limit $3`,
      [...params, DIGEST_MAX_ITEMS],
    )

    const baris = items.rows.map((row) => `- ${row.title}: ${row.body}`)
    if (total > DIGEST_MAX_ITEMS) {
      baris.push(`- dan ${total - DIGEST_MAX_ITEMS} pemberitahuan lain`)
    }

    try {
      await deps.sendEmail({
        to: user.email,
        subject: `Ringkasan harian Sahabat UMKM (${total} pemberitahuan)`,
        body: [
          `Ada ${total} pemberitahuan sejak ringkasan terakhir.`,
          '',
          baris.join('\n'),
          '',
          `Buka daftar lengkap: ${deps.webOrigin}/notifikasi`,
        ].join('\n'),
      })
    } catch (error) {
      deps.onError?.(error, `ringkasan harian pengguna ${user.user_id}`)
      continue
    }

    await deps.db.query(
      'update notification_digest_settings set last_digest_at = now() where user_id = $1',
      [Number(user.user_id)],
    )
    sent += 1
  }

  return sent
}

interface RenewalRow {
  workspace_id: number
  workspace_name: string
  timezone: string
  plan_code: PlanCode
  status: string
  trial_ends_at: Date | string | null
  current_period_end: Date | string | null
  renewal_reminder_7d_at: Date | string | null
  renewal_reminder_1d_at: Date | string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function tanggalPengingat(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone }).format(value)
}

/**
 * Pengingat perpanjangan (PRD 6.10): email tujuh hari dan satu hari sebelum
 * jatuh tempo, untuk masa uji coba maupun masa berlangganan berbayar.
 *
 * Suratnya dikirim ke pemegang izin `subscription.manage`, yaitu Owner, sama
 * seperti aturan akses langganan di PRD 8. Pengingat ini tidak mengikuti
 * preferensi notifikasi seperti PRD 6.9: tagihan adalah urusan langganan yang
 * berlaku untuk semua pemilik, bukan pemberitahuan yang boleh dimatikan.
 *
 * Cap waktu disimpan per masa di `workspace_subscriptions`, jadi menjalankan
 * tugas dua kali tidak mengirim surat kedua, dan masa baru mengosongkannya lagi.
 */
async function notifyRenewals(deps: DailyNotificationDeps, now: Date): Promise<number> {
  const rows = await deps.db.query<RenewalRow>(
    `select s.workspace_id, w.name as workspace_name, w.timezone, s.plan_code, s.status,
            s.trial_ends_at, s.current_period_end, s.renewal_reminder_7d_at, s.renewal_reminder_1d_at
       from workspace_subscriptions s
       join workspaces w on w.id = s.workspace_id
      where w.deleted_at is null
        and s.plan_code <> 'gratis'
        and (s.trial_ends_at is not null or s.current_period_end is not null)`,
  )

  let sent = 0
  for (const row of rows.rows) {
    const dueValue = row.current_period_end ?? row.trial_ends_at
    if (!dueValue) {
      continue
    }
    const due = new Date(dueValue)
    const sisaHari = due.getTime() - now.getTime()
    // Jatuh tempo yang sudah lewat ditangani `effectivePlan`, bukan surat.
    if (sisaHari <= 0) {
      continue
    }

    // Kalau tugas sempat tidak berjalan, hanya pengingat terdekat yang dikirim:
    // dua surat untuk tenggat yang sama justru membingungkan.
    const hari = sisaHari <= DAY_MS ? 1 : sisaHari <= 7 * DAY_MS ? 7 : 0
    if (hari === 0) {
      continue
    }

    const workspaceId = Number(row.workspace_id)
    const recipients = await recipientsFor(deps.db, workspaceId, 'subscription.manage')
    if (recipients.length === 0) {
      continue
    }

    // Klaim cap waktunya lebih dulu supaya dua penjadwal tidak mengirim surat
    // yang sama. Pengingat sehari sebelum jatuh tempo sekaligus menandai
    // pengingat tujuh hari, karena tenggatnya sudah lewat.
    const claimed = hari === 1
      ? await deps.db.query(
          `update workspace_subscriptions
              set renewal_reminder_1d_at = now(),
                  renewal_reminder_7d_at = coalesce(renewal_reminder_7d_at, now())
            where workspace_id = $1 and renewal_reminder_1d_at is null`,
          [workspaceId],
        )
      : await deps.db.query(
          `update workspace_subscriptions set renewal_reminder_7d_at = now()
            where workspace_id = $1 and renewal_reminder_7d_at is null`,
          [workspaceId],
        )
    if (claimed.affected === 0) {
      continue
    }

    const placeholders = recipients.map((_, index) => `$${index + 1}`).join(', ')
    const emails = await deps.db.query<{ email: string }>(
      `select email from users where deleted_at is null and id in (${placeholders})`,
      recipients,
    )

    const ujiCoba = row.status === 'uji_coba'
    const namaPaket = planCatalog[row.plan_code].name
    const tanggal = tanggalPengingat(due, row.timezone)
    const isi = ujiCoba
      ? [
          `Uji coba paket ${namaPaket} untuk usaha ${row.workspace_name} berakhir ${tanggal}, ${hari} hari lagi.`,
          '',
          'Setelah uji coba berakhir tanpa pembayaran, workspace kembali ke paket Gratis. Data tetap tersimpan, ' +
            'hanya fitur di atas batas paket Gratis yang terkunci.',
          '',
          `Pilih paket berbayar di ${deps.webOrigin}/pengaturan/paket`,
        ]
      : [
          `Langganan paket ${namaPaket} untuk usaha ${row.workspace_name} berakhir ${tanggal}, ${hari} hari lagi.`,
          '',
          'Perpanjang dari halaman paket supaya fitur paket berbayar tetap bisa dipakai: ' +
            `${deps.webOrigin}/pengaturan/paket`,
        ]

    let gagal = false
    for (const penerima of emails.rows) {
      try {
        await deps.sendEmail({
          to: penerima.email,
          subject: ujiCoba
            ? `Uji coba paket ${namaPaket} berakhir dalam ${hari} hari`
            : `Langganan paket ${namaPaket} berakhir dalam ${hari} hari`,
          body: isi.join('\n'),
        })
      } catch (error) {
        deps.onError?.(error, `pengingat perpanjangan workspace ${workspaceId}`)
        gagal = true
      }
    }

    if (gagal) {
      // Cap waktunya dilepas supaya percobaan berikutnya mengirim ulang. Sebagian
      // penerima bisa menerima surat dua kali, dan itu lebih baik daripada
      // pengingat tagihan yang hilang.
      await deps.db.query(
        hari === 1
          ? 'update workspace_subscriptions set renewal_reminder_1d_at = null where workspace_id = $1'
          : 'update workspace_subscriptions set renewal_reminder_7d_at = null where workspace_id = $1',
        [workspaceId],
      )
      continue
    }

    sent += 1
  }

  return sent
}

export async function runDailyNotifications(
  deps: DailyNotificationDeps,
  now: Date = new Date(),
): Promise<DailyNotificationResult> {
  const debtWorkspaces = await notifyOverdueDebts(deps, now)
  const renewalReminders = await notifyRenewals(deps, now)
  const digestsSent = await sendDailyDigests(deps, now)
  const expiredPayments = await expirePendingPayments(deps.db, now)
  return { debtWorkspaces, renewalReminders, digestsSent, expiredPayments }
}

export interface NotificationSchedulerOptions {
  db: Database
  sendEmail: (message: EmailMessage) => Promise<void>
  webOrigin: string
  /** Jeda pengirim email. Default 15 detik. */
  senderIntervalMs?: number
  /** Jeda tugas harian. Default satu jam. */
  dailyIntervalMs?: number
  onError?: (error: unknown, context: string) => void
}

/**
 * Menjalankan pengirim email dan tugas harian selama proses hidup. Timer
 * di-unref supaya penjadwal tidak menahan proses keluar, dan setiap galat
 * dilaporkan tanpa menghentikan timer berikutnya.
 */
export function startNotificationScheduler(options: NotificationSchedulerOptions): () => void {
  const onError = options.onError
  const senderDeps: NotificationSenderDeps = {
    db: options.db,
    sendEmail: options.sendEmail,
    webOrigin: options.webOrigin,
    ...(onError ? { onError: (error, notificationId) => onError(error, `email notifikasi ${notificationId}`) } : {}),
  }
  const dailyDeps: DailyNotificationDeps = {
    db: options.db,
    sendEmail: options.sendEmail,
    webOrigin: options.webOrigin,
    ...(onError ? { onError } : {}),
  }

  const runSender = (): void => {
    void flushNotificationEmails(senderDeps).catch((error: unknown) => onError?.(error, 'pengirim email notifikasi'))
  }
  const runDaily = (): void => {
    void runDailyNotifications(dailyDeps).catch((error: unknown) => onError?.(error, 'tugas harian notifikasi'))
  }

  const senderTimer = setInterval(runSender, options.senderIntervalMs ?? 15_000)
  const dailyTimer = setInterval(runDaily, options.dailyIntervalMs ?? 60 * 60 * 1000)
  senderTimer.unref()
  dailyTimer.unref()

  // Sekali di awal supaya email yang menunggu saat server dinyalakan tidak
  // menunggu satu putaran, dan ringkasan hari ini tidak terlewat saat deploy
  // terjadi setelah pukul 7 pagi.
  runSender()
  runDaily()

  return () => {
    clearInterval(senderTimer)
    clearInterval(dailyTimer)
  }
}
