import type { Sql } from '@sahabat/db'
import {
  formatQuantity,
  formatRupiah,
  grantFor,
  roleLabels,
  type Capability,
  type Role,
} from '@sahabat/shared'
import { createNotifications } from './service.ts'

/**
 * Titik pemicu notifikasi PRD 6.9. Penerima ditentukan dari izin, bukan dari
 * daftar nama: yang mendapat pemberitahuan stok rendah adalah anggota yang
 * memang boleh membuat PO, dan yang mendapat PO menunggu persetujuan adalah
 * anggota yang memang berwenang menyetujui. Preferensi per pengguna hanya bisa
 * mematikan, tidak pernah menambah.
 *
 * Semua fungsi di sini boleh dipanggil dengan transaksi (tx) milik peristiwa
 * maupun dengan database. Kalau dipanggil dengan tx, barisnya ikut dibatalkan
 * saat transaksi gagal, jadi tidak pernah ada notifikasi untuk peristiwa yang
 * batal.
 */

interface MemberRow {
  user_id: number | string
  role: Role
}

async function memberRows(db: Sql, workspaceId: number): Promise<MemberRow[]> {
  const result = await db.query<MemberRow>(
    `select m.user_id, m.role
       from memberships m
       join users u on u.id = m.user_id
      where m.workspace_id = $1 and m.removed_at is null and u.deleted_at is null`,
    [workspaceId],
  )
  return result.rows
}

/** Anggota yang punya izin capability, minus pelaku sendiri. */
export async function recipientsFor(
  db: Sql,
  workspaceId: number,
  capability: Capability,
  excludeUserId?: number,
): Promise<number[]> {
  const members = await memberRows(db, workspaceId)
  return members
    .filter((member) => grantFor(member.role, capability) !== 'none')
    .map((member) => Number(member.user_id))
    .filter((userId) => userId !== excludeUserId)
}

async function isMember(db: Sql, workspaceId: number, userId: number): Promise<boolean> {
  const result = await db.query(
    `select 1 from memberships
      where workspace_id = $1 and user_id = $2 and removed_at is null`,
    [workspaceId, userId],
  )
  return result.rows.length > 0
}

/**
 * Stok rendah dipanggil dari dalam recordMovement, jadi barisnya memakai tx yang
 * sama dengan baris ledger. Satu baris per produk per hari kalender workspace
 * supaya stok yang terus turun tidak mengirim email berkali-kali.
 */
export async function notifyLowStock(
  db: Sql,
  input: {
    workspaceId: number
    productId: number
    productName: string
    unitCode: string
    totalAfter: number
    minStock: number
    occurredOn: string
    actorUserId: number | null
  },
): Promise<void> {
  const recipients = await recipientsFor(
    db,
    input.workspaceId,
    'purchase_orders.create',
    input.actorUserId ?? undefined,
  )
  if (recipients.length === 0) {
    return
  }

  await createNotifications(
    db,
    recipients.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      kind: 'stok_rendah' as const,
      title: `Stok rendah: ${input.productName}`,
      body:
        `Sisa ${formatQuantity(input.totalAfter)} ${input.unitCode} di semua lokasi, ` +
        `batas minimum ${formatQuantity(input.minStock)} ${input.unitCode}.`,
      href: '/stok/peringatan',
      dedupeKey: `stok_rendah:${input.productId}:${input.occurredOn}`,
    })),
  )
}

/**
 * PO diajukan: penerimanya penyetuju. Purchasing hanya ikut kalau pengaturan
 * workspace memang mengizinkannya (B-03 dan requireCapability), supaya tidak ada
 * ajakan menyetujui yang berujung penolakan izin.
 */
export async function notifyPurchaseOrderSubmitted(
  db: Sql,
  input: { workspaceId: number; orderId: number; actorUserId: number },
): Promise<void> {
  const order = await db.query<{ number: string; total_amount: number | string; supplier: string }>(
    `select o.number, o.total_amount, s.name as supplier
       from purchase_orders o
       join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
      where o.id = $1 and o.workspace_id = $2`,
    [input.orderId, input.workspaceId],
  )
  const row = order.rows[0]
  if (!row) {
    return
  }

  const settings = await db.query<{ approval_required: boolean }>(
    'select approval_required from workspace_settings where workspace_id = $1',
    [input.workspaceId],
  )
  const approvalRequired = settings.rows[0]?.approval_required ?? false

  const members = await memberRows(db, input.workspaceId)
  const recipients = members
    .filter((member) => {
      const grant = grantFor(member.role, 'purchase_orders.approve')
      if (grant === 'manage') return true
      return grant === 'partial' && approvalRequired
    })
    .map((member) => Number(member.user_id))
    .filter((userId) => userId !== input.actorUserId)

  if (recipients.length === 0) {
    return
  }

  await createNotifications(
    db,
    recipients.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      kind: 'po_menunggu' as const,
      title: `PO ${row.number} menunggu persetujuan`,
      body: `${row.supplier}, total ${formatRupiah(Number(row.total_amount))}. Buka daftar PO untuk menyetujui atau menolak.`,
      href: '/pembelian/po',
      dedupeKey: `po_diajukan:${input.orderId}`,
    })),
  )
}

/** Keputusan PO kembali ke pembuatnya, siapa pun yang memutuskan. */
export async function notifyPurchaseOrderDecision(
  db: Sql,
  input: {
    workspaceId: number
    orderId: number
    decision: 'disetujui' | 'ditolak'
    actorUserId: number
    reason?: string | null
  },
): Promise<void> {
  const order = await db.query<{ number: string; created_by: string | null; total_amount: number | string }>(
    `select number, created_by, total_amount
       from purchase_orders
      where id = $1 and workspace_id = $2`,
    [input.orderId, input.workspaceId],
  )
  const row = order.rows[0]
  const creator = row?.created_by === null || row?.created_by === undefined ? null : Number(row.created_by)
  if (!row || creator === null || creator === input.actorUserId) {
    return
  }
  if (!(await isMember(db, input.workspaceId, creator))) {
    return
  }

  const actor = await db.query<{ name: string }>('select name from users where id = $1', [
    input.actorUserId,
  ])
  const actorName = actor.rows[0]?.name ?? 'Anggota lain'

  const approved = input.decision === 'disetujui'
  const reason = input.reason?.trim()
  const body = approved
    ? `PO ${row.number} disetujui oleh ${actorName}, total ${formatRupiah(Number(row.total_amount))}. Catat penerimaan saat barangnya datang.`
    : `PO ${row.number} ditolak oleh ${actorName}, total ${formatRupiah(Number(row.total_amount))}. Alasan: ${reason && reason.length > 0 ? reason : 'tidak dicatat'}.`

  await createNotifications(db, [
    {
      workspaceId: input.workspaceId,
      userId: creator,
      kind: approved ? 'po_disetujui' : 'po_ditolak',
      title: approved ? `PO ${row.number} disetujui` : `PO ${row.number} ditolak`,
      body,
      href: '/pembelian/po',
      dedupeKey: `${approved ? 'po_disetujui' : 'po_ditolak'}:${input.orderId}`,
    },
  ])
}

/** Undangan diterima: pemberitahuannya kembali ke pengirim undangan. */
export async function notifyInvitationAccepted(
  db: Sql,
  input: {
    workspaceId: number
    invitationId: number | string
    inviterUserId: number | null
    memberUserId: number
    memberName: string
    role: Role
  },
): Promise<void> {
  const inviter = input.inviterUserId === null ? null : Number(input.inviterUserId)
  if (inviter === null || inviter === input.memberUserId) {
    return
  }
  if (!(await isMember(db, input.workspaceId, inviter))) {
    return
  }

  await createNotifications(db, [
    {
      workspaceId: input.workspaceId,
      userId: inviter,
      kind: 'undangan',
      title: 'Undangan diterima',
      body: `${input.memberName} bergabung sebagai ${roleLabels[input.role] ?? input.role}.`,
      href: '/pengaturan/anggota',
      dedupeKey: `undangan_diterima:${input.invitationId}`,
    },
  ])
}

/**
 * Aktivitas keamanan akun. Notifikasi ini milik akun, bukan workspace, jadi
 * workspace_id-nya null dan tampil di daftar notifikasi workspace mana pun yang
 * sedang dibuka pemiliknya. Tidak ada kunci dedupe: dua peristiwa yang sama
 * tetap dua kejadian yang perlu diketahui.
 */
export async function notifySecurityActivity(
  db: Sql,
  input: { userId: number; title: string; body: string },
): Promise<void> {
  await createNotifications(db, [
    {
      workspaceId: null,
      userId: input.userId,
      kind: 'keamanan',
      title: input.title,
      body: input.body,
      href: '/pengaturan/akun',
    },
  ])
}
