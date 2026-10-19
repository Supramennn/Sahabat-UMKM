import type { Sql, Transaction } from '@sahabat/db'
import type { WorkspaceContext } from '../purchasing/routes.ts'
import { cancelSale } from '../sales/service.ts'
import { asNumber, recordMovement, reasonCodes, StockError } from '../stock/movements.ts'
import { todayInWorkspace, toDateString } from '../purchasing/documents.ts'

/**
 * Riwayat impor dan pembatalannya (PRD 6.8, B-04).
 *
 * B-04 menetapkan batas pembatalan: hasil impor boleh dibatalkan selama belum ada
 * transaksi turunan yang menyentuh barisnya. Empat jenis impor memakai aturan itu
 * dengan bentuk yang berbeda:
 *
 * - Impor barang dan supplier adalah data master. Barisnya dihapus, dan itu hanya
 *   boleh selama belum ada transaksi apa pun yang menyebutnya.
 * - Impor saldo awal menghasilkan baris ledger, jadi pembatalannya membuat baris
 *   pembalik, bukan menghapus ledger. Itu hanya boleh selama saldo di lokasi
 *   tersebut masih cukup untuk membalikkannya.
 * - Impor penjualan membatalkan tiap penjualannya lewat jalur pembatalan penjualan
 *   yang sama seperti pembatalan manual.
 *
 * Pemeriksaan di daftar riwayat hanya untuk tampilan; pemeriksaan yang mengikat
 * diulang di dalam transaksi pembatalan.
 */

export const importKindLabels = {
  produk: 'Impor barang',
  supplier: 'Impor supplier',
  saldo_awal: 'Impor saldo awal',
  penjualan: 'Impor penjualan',
} as const

export type ImportKind = keyof typeof importKindLabels

export interface ImportJobSummary {
  id: number
  kind: ImportKind
  kindLabel: string
  fileName: string | null
  totalRows: number
  importedRows: number
  skippedRows: number
  createdAt: string
  createdByName: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  status: 'selesai' | 'dibatalkan'
  cancelable: boolean
  cancelBlockedReason: string | null
}

export interface ImportJobsPage {
  jobs: ImportJobSummary[]
  pagination: { limit: number; offset: number; total: number }
}

export interface CancelImportResult {
  cancelled: number
  replayed: boolean
}

interface JobRow {
  id: string
  kind: ImportKind
  file_name: string | null
  total_rows: number
  imported_rows: number
  skipped_rows: number
  created_at: Date
  cancelled_at: Date | null
  created_by_name: string | null
  cancelled_by_name: string | null
}

export async function listImportJobs(
  db: Sql,
  workspaceId: number,
  limit: number,
  offset: number,
): Promise<ImportJobsPage> {
  const total = await db.query<{ count: string }>(
    'select count(*)::text as count from import_jobs where workspace_id = $1',
    [workspaceId],
  )

  const found = await db.query<JobRow>(
    `select j.id::text, j.kind, j.file_name, j.total_rows, j.imported_rows, j.skipped_rows,
            j.created_at, j.cancelled_at,
            pembuat.name as created_by_name, pembatal.name as cancelled_by_name
       from import_jobs j
       left join users pembuat on pembuat.id = j.created_by
       left join users pembatal on pembatal.id = j.cancelled_by
      where j.workspace_id = $1
      order by j.created_at desc, j.id desc
      limit $2 offset $3`,
    [workspaceId, limit, offset],
  )

  const blocked = await blockedReasonsFor(db, workspaceId, found.rows)

  const jobs: ImportJobSummary[] = found.rows.map((row) => {
    const cancelled = row.cancelled_at !== null
    const reason = cancelled ? null : (blocked.get(Number(row.id)) ?? null)
    return {
      id: Number(row.id),
      kind: row.kind,
      kindLabel: importKindLabels[row.kind],
      fileName: row.file_name,
      totalRows: row.total_rows,
      importedRows: row.imported_rows,
      skippedRows: row.skipped_rows,
      createdAt: row.created_at.toISOString(),
      createdByName: row.created_by_name,
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      cancelledByName: row.cancelled_by_name,
      status: cancelled ? 'dibatalkan' : 'selesai',
      cancelable: !cancelled && reason === null,
      cancelBlockedReason: reason,
    }
  })

  return {
    jobs,
    pagination: { limit, offset, total: Number(total.rows[0]?.count ?? 0) },
  }
}

export async function cancelImportJob(
  tx: Transaction,
  context: WorkspaceContext,
  jobId: number,
): Promise<CancelImportResult> {
  const found = await tx.query<{ id: string; kind: ImportKind; cancelled_at: Date | null }>(
    'select id::text, kind, cancelled_at from import_jobs where id = $1 and workspace_id = $2 for update',
    [jobId, context.workspaceId],
  )
  const job = found.rows[0]
  if (!job) {
    throw new StockError('impor_tidak_ditemukan', 'Impor tidak ditemukan.', 404)
  }
  if (job.cancelled_at) {
    return { cancelled: 0, replayed: true }
  }

  let cancelled: number
  if (job.kind === 'produk') {
    cancelled = await cancelProductsImport(tx, context, jobId)
  } else if (job.kind === 'supplier') {
    cancelled = await cancelSuppliersImport(tx, context, jobId)
  } else if (job.kind === 'saldo_awal') {
    cancelled = await cancelOpeningImport(tx, context, jobId)
  } else {
    cancelled = await cancelSalesImport(tx, context, jobId)
  }

  await tx.query(
    'update import_jobs set cancelled_at = now(), cancelled_by = $2 where id = $1',
    [jobId, context.userId],
  )

  return { cancelled, replayed: false }
}

/* Pemeriksaan pemakaian ------------------------------------------------------ */

/** Daftar placeholder untuk klausa in (...) supaya id tidak pernah masuk ke SQL. */
function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, index) => `$${start + index}`).join(', ')
}

async function blockedReasonsFor(
  db: Sql,
  workspaceId: number,
  rows: JobRow[],
): Promise<Map<number, string>> {
  const blocked = new Map<number, string>()

  const idsOf = (kind: ImportKind): number[] =>
    rows
      .filter((row) => row.cancelled_at === null && row.kind === kind)
      .map((row) => Number(row.id))

  const produkIds = idsOf('produk')
  if (produkIds.length > 0) {
    for (const [jobId, count] of await usedProducts(db, workspaceId, produkIds)) {
      blocked.set(
        jobId,
        `Tidak bisa dibatalkan karena ${count} barang dari impor ini sudah dipakai transaksi lain.`,
      )
    }
  }

  const supplierIds = idsOf('supplier')
  if (supplierIds.length > 0) {
    for (const [jobId, count] of await usedSuppliers(db, workspaceId, supplierIds)) {
      blocked.set(
        jobId,
        `Tidak bisa dibatalkan karena ${count} supplier dari impor ini sudah dipakai transaksi lain.`,
      )
    }
  }

  const openingIds = idsOf('saldo_awal')
  if (openingIds.length > 0) {
    for (const [jobId, count] of await blockedOpeningPairs(db, workspaceId, openingIds)) {
      blocked.set(
        jobId,
        `Tidak bisa dibatalkan karena stok dari ${count} baris saldo awal sudah terpakai transaksi lain.`,
      )
    }
  }

  return blocked
}

/** Produk hasil impor yang sudah disebut transaksi atau dokumen lain. */
async function usedProducts(
  db: Sql,
  workspaceId: number,
  jobIds: number[],
): Promise<Map<number, number>> {
  const found = await db.query<{ job_id: string; used: number }>(
    `select jp.import_job_id::text as job_id, count(*)::int as used
       from import_job_products jp
       join products p on p.id = jp.product_id and p.workspace_id = jp.workspace_id
      where jp.workspace_id = $1 and jp.import_job_id in (${placeholders(jobIds.length, 2)})
        and (
          exists (select 1 from stock_movements m
                   where m.product_id = p.id and m.workspace_id = p.workspace_id)
          or exists (select 1 from stock_count_items c
                      where c.product_id = p.id and c.workspace_id = p.workspace_id)
          or exists (select 1 from purchase_order_items i
                      where i.product_id = p.id and i.workspace_id = p.workspace_id)
          or exists (select 1 from goods_receipt_items i
                      where i.product_id = p.id and i.workspace_id = p.workspace_id)
          or exists (select 1 from purchase_return_items i
                      where i.product_id = p.id and i.workspace_id = p.workspace_id)
          or exists (select 1 from sale_items i
                      where i.product_id = p.id and i.workspace_id = p.workspace_id)
        )
      group by jp.import_job_id`,
    [workspaceId, ...jobIds],
  )

  return new Map(found.rows.map((row) => [Number(row.job_id), row.used]))
}

/** Supplier hasil impor yang sudah disebut dokumen atau pembayaran. */
async function usedSuppliers(
  db: Sql,
  workspaceId: number,
  jobIds: number[],
): Promise<Map<number, number>> {
  const found = await db.query<{ job_id: string; used: number }>(
    `select js.import_job_id::text as job_id, count(*)::int as used
       from import_job_suppliers js
       join suppliers s on s.id = js.supplier_id and s.workspace_id = js.workspace_id
      where js.workspace_id = $1 and js.import_job_id in (${placeholders(jobIds.length, 2)})
        and (
          exists (select 1 from purchase_orders o
                   where o.supplier_id = s.id and o.workspace_id = s.workspace_id)
          or exists (select 1 from goods_receipts r
                      where r.supplier_id = s.id and r.workspace_id = s.workspace_id)
          or exists (select 1 from purchase_returns r
                      where r.supplier_id = s.id and r.workspace_id = s.workspace_id)
          or exists (select 1 from supplier_payments p
                      where p.supplier_id = s.id and p.workspace_id = s.workspace_id)
          or exists (select 1 from supplier_debt_entries e
                      where e.supplier_id = s.id and e.workspace_id = s.workspace_id)
        )
      group by js.import_job_id`,
    [workspaceId, ...jobIds],
  )

  return new Map(found.rows.map((row) => [Number(row.job_id), row.used]))
}

/**
 * Baris saldo awal yang saldonya tidak lagi cukup untuk dibalik. Saldo dihitung
 * dari saldo saat ini, bukan dari daftar transaksi: penjualan yang sudah dibatalkan
 * mengembalikan stok, jadi ia tidak boleh membuat impor terkunci selamanya.
 */
async function blockedOpeningPairs(
  db: Sql,
  workspaceId: number,
  jobIds: number[],
): Promise<Map<number, number>> {
  const found = await db.query<{ job_id: string; blocked: number }>(
    `select needed.import_job_id::text as job_id, count(*)::int as blocked
       from (
         select jm.import_job_id, m.product_id, m.location_id, sum(m.quantity) as needed
           from import_job_stock_movements jm
           join stock_movements m on m.id = jm.stock_movement_id and m.workspace_id = jm.workspace_id
          where jm.workspace_id = $1 and jm.import_job_id in (${placeholders(jobIds.length, 2)})
          group by jm.import_job_id, m.product_id, m.location_id
       ) needed
       left join stock_balances b
              on b.workspace_id = $1 and b.product_id = needed.product_id and b.location_id = needed.location_id
      where coalesce(b.quantity, 0) < needed.needed
      group by needed.import_job_id`,
    [workspaceId, ...jobIds],
  )

  return new Map(found.rows.map((row) => [Number(row.job_id), row.blocked]))
}

/* Pembatalan per jenis ------------------------------------------------------- */

async function cancelProductsImport(
  tx: Transaction,
  context: WorkspaceContext,
  jobId: number,
): Promise<number> {
  const used = (await usedProducts(tx, context.workspaceId, [jobId])).get(jobId) ?? 0
  if (used > 0) {
    throw new StockError(
      'impor_tidak_bisa_dibatalkan',
      `Impor tidak bisa dibatalkan karena ${used} barang dari impor ini sudah dipakai transaksi lain.`,
      409,
      { used },
    )
  }

  const ids = await tx.query<{ product_id: string }>(
    'select product_id::text from import_job_products where workspace_id = $1 and import_job_id = $2',
    [context.workspaceId, jobId],
  )
  const productIds = ids.rows.map((row) => Number(row.product_id))
  if (productIds.length === 0) {
    return 0
  }

  const list = placeholders(productIds.length, 2)
  await tx.query(
    `delete from product_costs where workspace_id = $1 and product_id in (${list})`,
    [context.workspaceId, ...productIds],
  )
  await tx.query('delete from import_job_products where workspace_id = $1 and import_job_id = $2', [
    context.workspaceId,
    jobId,
  ])
  await tx
    .query(`delete from products where workspace_id = $1 and id in (${list})`, [
      context.workspaceId,
      ...productIds,
    ])
    .catch((error: unknown) => {
      throw asFkConflict(error, 'sebagian barangnya sudah dipakai data lain')
    })

  return productIds.length
}

async function cancelSuppliersImport(
  tx: Transaction,
  context: WorkspaceContext,
  jobId: number,
): Promise<number> {
  const used = (await usedSuppliers(tx, context.workspaceId, [jobId])).get(jobId) ?? 0
  if (used > 0) {
    throw new StockError(
      'impor_tidak_bisa_dibatalkan',
      `Impor tidak bisa dibatalkan karena ${used} supplier dari impor ini sudah dipakai transaksi lain.`,
      409,
      { used },
    )
  }

  const ids = await tx.query<{ supplier_id: string }>(
    'select supplier_id::text from import_job_suppliers where workspace_id = $1 and import_job_id = $2',
    [context.workspaceId, jobId],
  )
  const supplierIds = ids.rows.map((row) => Number(row.supplier_id))
  if (supplierIds.length === 0) {
    return 0
  }

  const list = placeholders(supplierIds.length, 2)
  await tx.query('delete from import_job_suppliers where workspace_id = $1 and import_job_id = $2', [
    context.workspaceId,
    jobId,
  ])
  await tx
    .query(`delete from suppliers where workspace_id = $1 and id in (${list})`, [
      context.workspaceId,
      ...supplierIds,
    ])
    .catch((error: unknown) => {
      throw asFkConflict(error, 'sebagian suppliernya sudah dipakai data lain')
    })

  return supplierIds.length
}

async function cancelOpeningImport(
  tx: Transaction,
  context: WorkspaceContext,
  jobId: number,
): Promise<number> {
  const blocked = (await blockedOpeningPairs(tx, context.workspaceId, [jobId])).get(jobId) ?? 0
  if (blocked > 0) {
    throw new StockError(
      'impor_tidak_bisa_dibatalkan',
      `Impor tidak bisa dibatalkan karena stok dari ${blocked} baris saldo awal sudah terpakai transaksi lain.`,
      409,
      { blocked },
    )
  }

  const movements = await tx.query<{
    id: string
    product_id: string
    location_id: string
    quantity: string
  }>(
    `select m.id::text, m.product_id::text, m.location_id::text, m.quantity::text
       from import_job_stock_movements jm
       join stock_movements m on m.id = jm.stock_movement_id and m.workspace_id = jm.workspace_id
      where jm.workspace_id = $1 and jm.import_job_id = $2
      order by m.id`,
    [context.workspaceId, jobId],
  )

  const hariIni = toDateString(await todayInWorkspace(tx, context.workspaceId))
  let reversed = 0

  for (const movement of movements.rows) {
    await recordMovement(tx, {
      workspaceId: context.workspaceId,
      productId: Number(movement.product_id),
      locationId: Number(movement.location_id),
      kind: 'keluar',
      direction: 'kurang',
      quantity: asNumber(movement.quantity),
      reasonCode: reasonCodes.pembatalanImpor,
      occurredOn: hariIni,
      actorUserId: context.userId,
      idempotencyKey: `impor-batal:${jobId}:${movement.id}`,
    })
    reversed += 1
  }

  return reversed
}

async function cancelSalesImport(
  tx: Transaction,
  context: WorkspaceContext,
  jobId: number,
): Promise<number> {
  const sales = await tx.query<{ id: string }>(
    `select s.id
       from sales s
       join import_job_sales j on j.sale_id = s.id and j.workspace_id = s.workspace_id
      where j.import_job_id = $1 and s.workspace_id = $2
      order by s.id
      for update of s`,
    [jobId, context.workspaceId],
  )

  const hariIni = toDateString(await todayInWorkspace(tx, context.workspaceId))
  let cancelled = 0

  for (const sale of sales.rows) {
    const sudahAdaPembatalan = await tx.query(
      `select 1 from sale_stock_movements
        where sale_id = $1 and workspace_id = $2 and role = 'pembatalan'`,
      [sale.id, context.workspaceId],
    )
    if (sudahAdaPembatalan.rows.length > 0) {
      // Penjualan ini sudah dibatalkan satu per satu. Ledgernya sudah berbalik,
      // jadi membatalkannya lagi berarti menambah stok dua kali.
      continue
    }

    // Jalur pembatalannya sama dengan pembatalan manual, termasuk harga pokok
    // snapshot, supaya pembatalan impor tidak punya aturan persediaan sendiri.
    await cancelSale(tx, {
      workspaceId: context.workspaceId,
      saleId: Number(sale.id),
      actorUserId: context.userId,
      reason: 'Impor dibatalkan',
      cancelledOn: hariIni,
    })
    cancelled += 1
  }

  return cancelled
}

function asFkConflict(error: unknown, detail: string): unknown {
  if ((error as { code?: string } | null)?.code === '23503') {
    return new StockError(
      'impor_tidak_bisa_dibatalkan',
      `Impor tidak bisa dibatalkan karena ${detail}.`,
      409,
    )
  }
  return error
}
