import type { Database, Sql, Transaction } from '@sahabat/db'
import { planCatalog, planLimitMessage, type PlanCode } from '@sahabat/shared'
import { StockError } from '../stock/movements.ts'

export async function effectivePlan(db: Sql, workspaceId: number): Promise<PlanCode> {
  const found = await db.query<{ plan_code: PlanCode; trial_ends_at: Date | string | null }>(
    `select plan_code, trial_ends_at from workspace_subscriptions where workspace_id = $1`,
    [workspaceId],
  )
  const subscription = found.rows[0]
  if (!subscription) throw new StockError('langganan_tidak_ditemukan', 'Paket workspace tidak ditemukan.', 404)
  if (subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() <= Date.now()) {
    await db.query(
      `update workspace_subscriptions set plan_code = 'gratis', status = 'aktif',
              trial_started_at = null, trial_ends_at = null, updated_at = now() where workspace_id = $1`,
      [workspaceId],
    )
    return 'gratis'
  }
  return subscription.plan_code
}

export async function readEffectivePlan(db: Database, workspaceId: number): Promise<PlanCode> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId)
    return effectivePlan(tx, workspaceId)
  })
}

export async function ensurePlanCapacity(
  tx: Transaction,
  workspaceId: number,
  resource: 'produk' | 'anggota' | 'lokasi',
  additional = 1,
): Promise<void> {
  // Serialisasi semua penambahan yang dibatasi pada baris workspace mencegah
  // permintaan bersamaan melewati batas paket.
  await lockWorkspace(tx, workspaceId)
  const plan = await effectivePlan(tx, workspaceId)
  const limit = planCatalog[plan][resource === 'produk' ? 'activeProducts' : resource === 'anggota' ? 'members' : 'locations']
  let used: number
  if (resource === 'produk') {
    const result = await tx.query<{ count: string }>(
      `select count(*)::text as count from products where workspace_id = $1 and status = 'aktif'`,
      [workspaceId],
    )
    used = Number(result.rows[0]?.count ?? 0)
  } else if (resource === 'lokasi') {
    const result = await tx.query<{ count: string }>(
      'select count(*)::text as count from locations where workspace_id = $1 and not is_archived',
      [workspaceId],
    )
    used = Number(result.rows[0]?.count ?? 0)
  } else {
    const result = await tx.query<{ count: string }>(
      `select
         (select count(*) from memberships where workspace_id = $1 and removed_at is null) +
         (select count(*) from workspace_invitations
           where workspace_id = $1 and accepted_at is null and revoked_at is null and expires_at > now())
         as count`,
      [workspaceId],
    )
    used = Number(result.rows[0]?.count ?? 0)
  }
  if (used + additional > limit) {
    throw new StockError('batas_paket', planLimitMessage(resource, limit), 409, {
      resource, limit, used, requested: additional, plan,
    })
  }
}

export async function ensureFeature(
  tx: Transaction,
  workspaceId: number,
  feature: 'sales' | 'returns' | 'stocktake' | 'xlsxExport' | 'multilevelApproval',
): Promise<void> {
  await lockWorkspace(tx, workspaceId)
  await assertFeature(tx, workspaceId, feature)
}

export async function assertFeature(
  db: Sql,
  workspaceId: number,
  feature: 'sales' | 'returns' | 'stocktake' | 'xlsxExport' | 'multilevelApproval',
): Promise<void> {
  const plan = await effectivePlan(db, workspaceId)
  if (!planCatalog[plan][feature]) {
    const messages = {
      sales: 'Pencatatan penjualan tersedia mulai paket Usaha.',
      returns: 'Retur dan pencatatan utang supplier tersedia mulai paket Usaha.',
      stocktake: 'Stok opname tersedia mulai paket Usaha.',
      xlsxExport: 'Ekspor XLSX tersedia mulai paket Usaha. Ekspor CSV tetap tersedia.',
      multilevelApproval: 'Approval PO berjenjang tersedia di paket Bisnis.',
    }
    throw new StockError('fitur_paket', `${messages[feature]} Pilih paket lain di Pengaturan.`, 403, { feature, plan })
  }
}

export async function lockWorkspace(tx: Transaction, workspaceId: number): Promise<void> {
  await tx.lockRow('select id from workspaces where id = $1 for update', [workspaceId])
  await tx.query(
    `insert into workspace_subscriptions (workspace_id) values ($1)
     on conflict (workspace_id) do nothing`,
    [workspaceId],
  )
}

export async function assertPlanFits(
  db: Transaction,
  workspaceId: number,
  plan: PlanCode,
): Promise<void> {
  const limits = planCatalog[plan]
  await lockWorkspace(db, workspaceId)
  const counts = await db.query<{ products: string; members: string; locations: string }>(
    `select
       (select count(*) from products where workspace_id = $1 and status = 'aktif')::text as products,
       ((select count(*) from memberships where workspace_id = $1 and removed_at is null) +
        (select count(*) from workspace_invitations where workspace_id = $1 and accepted_at is null
           and revoked_at is null and expires_at > now()))::text as members,
       (select count(*) from locations where workspace_id = $1 and not is_archived)::text as locations`,
    [workspaceId],
  )
  const row = counts.rows[0]!
  const used = { produk: Number(row.products), anggota: Number(row.members), lokasi: Number(row.locations) }
  const exceeded = (Object.keys(used) as Array<keyof typeof used>).find((key) => {
    const cap = key === 'produk' ? limits.activeProducts : key === 'anggota' ? limits.members : limits.locations
    return used[key] > cap
  })
  if (exceeded) {
    const cap = exceeded === 'produk' ? limits.activeProducts : exceeded === 'anggota' ? limits.members : limits.locations
    throw new StockError('batas_paket', `${planLimitMessage(exceeded, cap)} Kurangi penggunaan yang sudah ada sebelum menurunkan paket.`, 409, {
      resource: exceeded, limit: cap, used: used[exceeded], plan,
    })
  }
}
