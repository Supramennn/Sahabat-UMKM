import type { Transaction } from '@sahabat/db'
import { roundRupiah } from '@sahabat/shared'
import { asNumber, reasonCodes, recordMovement, StockError } from '../stock/movements.ts'
import { allocateDocumentNumber } from '../purchasing/documents.ts'

/**
 * Penjualan (PRD 6.4). Modul ini tidak menulis ke stock_movements secara langsung:
 * penjualan mengurangi stok dengan `recordMovement`, jadi penguncian baris saldo,
 * aturan lot, dan penolakan stok negatif sama persis dengan stok keluar manual.
 *
 * Tiga hal yang membedakan penjualan dari entri stok biasa:
 *
 * 1. Harga pokok diambil dari rata-rata bergerak pada saat transaksi dan disimpan
 *    sebagai snapshot di baris penjualan (A-07). Kalau laba kotor dihitung ulang dari
 *    rata-rata yang sekarang, laba bulan lalu akan berubah karena ada penerimaan baru
 *    bulan ini.
 * 2. Pembatalan membuat baris ledger baru dengan arah sebaliknya. Baris lama tidak
 *    pernah dihapus (PRD 6.4).
 * 3. Nomor penjualan mengikuti urutan dokumen INV-{tahun}-{urutan} per workspace.
 *
 * Urutan menulis di createSale penting: baris ledger lebih dulu, baris penjualan
 * setelahnya. Penjualan ditulis sekali dengan total yang sudah final, karena trigger
 * protect_sale_row menolak perubahan isi penjualan yang sudah tersimpan.
 */

export interface SaleItemInput {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount?: number | null | undefined
  note?: string | null | undefined
}

export interface CreateSaleInput {
  workspaceId: number
  actorUserId: number
  soldOn: string
  locationId: number
  customerId?: number | null | undefined
  paymentMethodId?: number | null | undefined
  paymentMethodLabel: string
  note?: string | null | undefined
  items: SaleItemInput[]
  idempotencyKey?: string | null | undefined
}

export interface CreatedSale {
  saleId: number
  number: string
  totalAmount: number
  costTotal: number
  grossProfit: number
  replayed: boolean
}

export interface MergedSaleItem {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount: number
  note: string | null
}

/**
 * Baris dengan produk yang sama digabung lebih dulu.
 *
 * Kalau tidak digabung, dua baris untuk satu produk akan memeriksa stok satu per satu,
 * dan penjualan dua kilo menjadi dua kilo masih lolos padahal barangnya cuma satu kilo.
 * Setelah digabung, saldo yang diperiksa persis sama dengan yang akan dikurangi.
 */
export function mergeSaleItems(items: SaleItemInput[]): MergedSaleItem[] {
  const digabung = new Map<number, MergedSaleItem>()

  for (const item of items) {
    const ada = digabung.get(item.productId)
    if (ada) {
      ada.quantity += item.quantity
      ada.discountAmount += item.discountAmount ?? 0
      ada.note = ada.note ?? item.note ?? null
    } else {
      digabung.set(item.productId, {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount ?? 0,
        note: item.note ?? null,
      })
    }
  }

  return [...digabung.values()]
}

interface ResolvedItem extends MergedSaleItem {
  unitCost: number
  lineSubtotal: number
  lineCost: number
  movementId: number
}

export async function findSaleByIdempotencyKey(
  tx: Transaction,
  workspaceId: number,
  key: string,
): Promise<{ saleId: number; number: string; totalAmount: number; costTotal: number } | null> {
  const found = await tx.query<{
    id: string
    number: string
    total_amount: string
    cost_total: string
  }>(
    `select id, number, total_amount, cost_total
       from sales
      where workspace_id = $1 and idempotency_key = $2`,
    [workspaceId, key],
  )
  const row = found.rows[0]
  if (!row) {
    return null
  }
  return {
    saleId: Number(row.id),
    number: row.number,
    totalAmount: asNumber(row.total_amount),
    costTotal: asNumber(row.cost_total),
  }
}

export async function createSale(tx: Transaction, input: CreateSaleInput): Promise<CreatedSale> {
  if (input.idempotencyKey) {
    const replay = await findSaleByIdempotencyKey(tx, input.workspaceId, input.idempotencyKey)
    if (replay) {
      return {
        saleId: replay.saleId,
        number: replay.number,
        totalAmount: replay.totalAmount,
        costTotal: replay.costTotal,
        grossProfit: replay.totalAmount - replay.costTotal,
        replayed: true,
      }
    }
  }

  const baris = mergeSaleItems(input.items)

  for (const item of baris) {
    const lineSubtotal = roundRupiah(item.quantity * item.unitPrice)
    if (item.discountAmount > lineSubtotal) {
      throw new StockError(
        'diskon_terlalu_besar',
        'Diskon pada satu baris lebih besar dari nilai barangnya. Perbaiki jumlahnya lalu simpan ulang.',
        400,
        { productId: item.productId },
      )
    }
  }

  const number = await allocateDocumentNumber(
    tx,
    input.workspaceId,
    'penjualan',
    new Date(`${input.soldOn}T00:00:00.000Z`),
  )

  const resolved: ResolvedItem[] = []

  for (const item of baris) {
    // recordMovement mengembalikan rata-rata bergerak setelah transaksi. Untuk barang
    // keluar rata-rata tidak berubah, jadi nilai yang dikembalikan adalah rata-rata
    // pada saat barang ini terjual, persis yang dipakai untuk laba kotor (A-07).
    const movement = await recordMovement(tx, {
      workspaceId: input.workspaceId,
      productId: item.productId,
      locationId: input.locationId,
      kind: 'keluar',
      direction: 'kurang',
      quantity: item.quantity,
      reasonCode: reasonCodes.penjualan,
      reference: number,
      note: item.note ?? null,
      occurredOn: input.soldOn,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:baris:${item.productId}` : null,
    })

    const unitCost = movement.averageCost
    resolved.push({
      ...item,
      unitCost,
      lineSubtotal: roundRupiah(item.quantity * item.unitPrice),
      lineCost: roundRupiah(item.quantity * unitCost),
      movementId: movement.movementId,
    })
  }

  const subtotal = resolved.reduce((total, item) => total + item.lineSubtotal, 0)
  const discountTotal = resolved.reduce((total, item) => total + item.discountAmount, 0)
  const costTotal = resolved.reduce((total, item) => total + item.lineCost, 0)
  const totalAmount = subtotal - discountTotal

  const inserted = await tx.query<{ id: string }>(
    `insert into sales
       (workspace_id, number, sold_on, location_id, customer_id,
        payment_method_id, payment_method_label, subtotal, discount_total,
        total_amount, cost_total, note, idempotency_key, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     returning id`,
    [
      input.workspaceId,
      number,
      input.soldOn,
      input.locationId,
      input.customerId ?? null,
      input.paymentMethodId ?? null,
      input.paymentMethodLabel,
      subtotal,
      discountTotal,
      totalAmount,
      costTotal,
      input.note ?? null,
      input.idempotencyKey ?? null,
      input.actorUserId,
    ],
  )
  const saleId = Number(inserted.rows[0]!.id)

  for (const item of resolved) {
    await tx.query(
      `insert into sale_items
         (workspace_id, sale_id, product_id, quantity, unit_price, discount_amount,
          line_total, unit_cost_snapshot, cost_total, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.workspaceId,
        saleId,
        item.productId,
        item.quantity,
        item.unitPrice,
        item.discountAmount,
        item.lineSubtotal - item.discountAmount,
        item.unitCost,
        item.lineCost,
        item.note,
      ],
    )

    await tx.query(
      `insert into sale_stock_movements (workspace_id, sale_id, stock_movement_id, role)
       values ($1, $2, $3, 'penjualan')`,
      [input.workspaceId, saleId, item.movementId],
    )
  }

  return { saleId, number, totalAmount, costTotal, grossProfit: totalAmount - costTotal, replayed: false }
}

export interface CancelSaleInput {
  workspaceId: number
  saleId: number
  actorUserId: number
  reason: string | null
  /** Tanggal pembatalan menurut zona waktu workspace (B-10). */
  cancelledOn: string
}

export interface CancelledSale {
  saleId: number
  number: string
  reversedMovements: number
  replayed: boolean
}

/**
 * Pembatalan memakai harga pokok snapshot baris penjualan, bukan rata-rata yang sedang
 * berlaku (A-07). Memakai rata-rata sekarang akan membuat pembatalan penjualan bulan
 * lalu mengubah rata-rata dengan harga yang sudah lewat.
 *
 * Snapshot bulat per satuan dipakai, sesuai K-12: nilai akhir disimpan dalam rupiah
 * penuh. Selisih paling besar yang muncul adalah kurang dari satu rupiah per satuan per
 * pembatalan, dan tidak pernah menumpuk karena pembatalan hanya boleh sekali.
 */
export async function cancelSale(tx: Transaction, input: CancelSaleInput): Promise<CancelledSale> {
  const sale = await tx.query<{ id: string; number: string; status: string; location_id: string }>(
    `select id, number, status, location_id
       from sales
      where id = $1 and workspace_id = $2
      for update`,
    [input.saleId, input.workspaceId],
  )

  const row = sale.rows[0]
  if (!row) {
    throw new StockError('penjualan_tidak_ditemukan', 'Penjualan tidak ditemukan.', 404)
  }

  if (row.status === 'dibatalkan') {
    // Membatalkan dua kali bukan galat: layar sudah menampilkan keadaan sebenarnya
    // dan tombolnya sudah tidak bisa ditekan lagi.
    return { saleId: input.saleId, number: row.number, reversedMovements: 0, replayed: true }
  }

  const items = await tx.query<{
    product_id: string
    quantity: string
    unit_cost_snapshot: string
    note: string | null
  }>(
    `select product_id, quantity, unit_cost_snapshot, note
       from sale_items
      where sale_id = $1 and workspace_id = $2
      order by id`,
    [input.saleId, input.workspaceId],
  )

  let reversed = 0

  for (const item of items.rows) {
    const movement = await recordMovement(tx, {
      workspaceId: input.workspaceId,
      productId: Number(item.product_id),
      locationId: Number(row.location_id),
      kind: 'masuk',
      direction: 'tambah',
      quantity: asNumber(item.quantity),
      unitCost: roundRupiah(asNumber(item.unit_cost_snapshot)),
      reasonCode: reasonCodes.pembatalanPenjualan,
      reference: row.number,
      note: item.note ?? null,
      occurredOn: input.cancelledOn,
      actorUserId: input.actorUserId,
    })

    await tx.query(
      `insert into sale_stock_movements (workspace_id, sale_id, stock_movement_id, role)
       values ($1, $2, $3, 'pembatalan')`,
      [input.workspaceId, input.saleId, movement.movementId],
    )

    reversed += 1
  }

  await tx.query(
    `update sales set status = 'dibatalkan', cancelled_at = now(), cancelled_by = $3, cancel_reason = $4
      where id = $1 and workspace_id = $2`,
    [input.saleId, input.workspaceId, input.actorUserId, input.reason ?? null],
  )

  return { saleId: input.saleId, number: row.number, reversedMovements: reversed, replayed: false }
}