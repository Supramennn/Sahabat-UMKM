import type { Transaction } from '@sahabat/db'
import { inventoryValueAfterOut, recalculateMovingAverage } from '@sahabat/shared'

/**
 * Inti integritas stok. Setiap perubahan stok melewati fungsi ini, dan tidak ada
 * jalur lain yang boleh menulis ke stock_movements atau stock_balances.
 *
 * Urutan langkahnya tidak boleh diubah tanpa menguji ulang PRD 6.2:
 *
 * 1. Baris produk dikunci supaya statusnya tidak berubah di tengah transaksi.
 * 2. Baris saldo dikunci dengan select ... for update. Inilah yang membuat dua
 *    pengguna yang mengeluarkan stok terakhir pada saat bersamaan menghasilkan
 *    satu transaksi berhasil dan satu penolakan, bukan saldo negatif (PRD 6.2).
 * 3. Keterangan produk dan lokasi dibaca untuk pesan galat yang menyebut objeknya.
 * 4. Baris ledger ditulis lebih dulu, dengan saldo sebelum dan sesudah, lalu saldo
 *    diperbarui. Keduanya dalam satu transaksi, jadi tidak mungkin terlihat
 *    setengah jadi oleh pembaca lain.
 * 5. Lot dan rata-rata bergerak diperbarui.
 *
 * Nilai numerik dari PostgreSQL untuk kolom numeric dan bigint datang sebagai
 * string, jadi selalu lewat asNumber dan bukan dipakai langsung.
 */

export type MovementKind =
  | 'masuk'
  | 'keluar'
  | 'penyesuaian_naik'
  | 'penyesuaian_turun'
  | 'opname_selisih'

export type MovementDirection = 'tambah' | 'kurang'

export const movementKinds: MovementKind[] = [
  'masuk',
  'keluar',
  'penyesuaian_naik',
  'penyesuaian_turun',
  'opname_selisih',
]

/**
 * Arah bawaan per jenis gerak. Selisih opname tidak ada di sini karena arahnya
 * ditentukan dari hasil hitungan, bukan dari jenisnya (A-05).
 */
export function directionForKind(kind: MovementKind, difference?: number): MovementDirection {
  switch (kind) {
    case 'masuk':
    case 'penyesuaian_naik':
      return 'tambah'
    case 'keluar':
    case 'penyesuaian_turun':
      return 'kurang'
    case 'opname_selisih':
      return (difference ?? 0) >= 0 ? 'tambah' : 'kurang'
  }
}

/** Alasan bawaan. Kode ini disimpan apa adanya supaya laporan bisa mengelompokkan. */
export const reasonCodes = {
  pembelian: 'pembelian',
  penjualan: 'penjualan',
  retur: 'retur_pembelian',
  rusak: 'rusak',
  kadaluwarsa: 'kadaluwarsa',
  hilang: 'hilang',
  salahCatat: 'salah_catat',
  opname: 'opname',
} as const

export type ReasonCode = (typeof reasonCodes)[keyof typeof reasonCodes]

export interface RecordMovementInput {
  workspaceId: number
  productId: number
  locationId: number
  kind: MovementKind
  direction: MovementDirection
  /** Selalu positif. Arahnya ada di kolom direction. */
  quantity: number
  /** Harga beli per satuan untuk barang masuk, rupiah penuh. */
  unitCost?: number | null
  expiresAt?: string | null
  reasonCode: string
  reference?: string | null
  note?: string | null
  /** Tanggal kalender di zona waktu workspace, bentuk YYYY-MM-DD. */
  occurredOn: string
  actorUserId: number | null
  idempotencyKey?: string | null
}

export interface RecordMovementResult {
  movementId: number
  balanceBefore: number
  balanceAfter: number
  averageCost: number
  inventoryValue: number
  /** True ketika permintaan ini mengulang permintaan yang sama lewat kunci idempotency. */
  replayed: boolean
}

interface ProductRow {
  id: number
  name: string
  sku: string
  unit_code: string
  status: string
}

interface LocationRow {
  id: number
  name: string
}

interface BalanceRow {
  quantity: string
}

interface CostRow {
  average_cost: string
  inventory_value: string
}

export class StockError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(
    code: string,
    message: string,
    statusCode = 409,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'StockError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

/** PostgreSQL mengembalikan bigint dan numeric sebagai string. */
export function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function findMovementByIdempotencyKey(
  tx: Transaction,
  workspaceId: number,
  key: string,
): Promise<RecordMovementResult | null> {
  const found = await tx.query<{
    id: string
    balance_before: string
    balance_after: string
  }>(
    `select id, balance_before, balance_after
       from stock_movements
      where workspace_id = $1 and idempotency_key = $2`,
    [workspaceId, key],
  )
  const row = found.rows[0]
  if (!row) {
    return null
  }

  return {
    movementId: Number(row.id),
    balanceBefore: asNumber(row.balance_before),
    balanceAfter: asNumber(row.balance_after),
    averageCost: 0,
    inventoryValue: 0,
    replayed: true,
  }
}

export async function recordMovement(
  tx: Transaction,
  input: RecordMovementInput,
): Promise<RecordMovementResult> {
  if (input.idempotencyKey) {
    const replay = await findMovementByIdempotencyKey(tx, input.workspaceId, input.idempotencyKey)
    if (replay) {
      return replay
    }
  }

  const product = await lockProduct(tx, input.workspaceId, input.productId)
  const location = await lockLocation(tx, input.workspaceId, input.locationId)

  if (product.status === 'diarsipkan') {
    throw new StockError(
      'produk_diarsipkan',
      `Produk ${product.name} sudah diarsipkan, jadi tidak bisa dipakai untuk input stok baru.`,
    )
  }

  const balance = await lockBalance(tx, input.workspaceId, input.productId, input.locationId)
  const balanceBefore = asNumber(balance.quantity)
  const addsStock = input.direction === 'tambah'
  const delta = addsStock ? input.quantity : -input.quantity
  const balanceAfter = balanceBefore + delta

  if (balanceAfter < 0) {
    // Pesan menyebut produk, lokasi, dan saldo yang tersedia, supaya staf tahu
    // apa yang harus dikoreksi tanpa membuka halaman lain.
    throw new StockError(
      'stok_tidak_cukup',
      `Stok ${product.name} di ${location.name} tinggal ${trimNumber(balanceBefore)} ${product.unit_code}. ` +
        `Tidak bisa mengeluarkan ${trimNumber(input.quantity)} ${product.unit_code}.`,
      409,
      {
        productId: product.id,
        locationId: location.id,
        available: balanceBefore,
        requested: input.quantity,
      },
    )
  }

  const inserted = await tx.query<{ id: string }>(
    `insert into stock_movements
       (workspace_id, product_id, location_id, kind, direction, quantity, unit_cost,
        balance_before, balance_after, reason_code, reference, note,
        occurred_on, actor_user_id, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning id`,
    [
      input.workspaceId,
      input.productId,
      input.locationId,
      input.kind,
      input.direction,
      input.quantity,
      addsStock ? (input.unitCost ?? null) : null,
      balanceBefore,
      balanceAfter,
      input.reasonCode,
      input.reference ?? null,
      input.note ?? null,
      input.occurredOn,
      input.actorUserId,
      input.idempotencyKey ?? null,
    ],
  )
  const movementId = Number(inserted.rows[0]!.id)

  await tx.query(
    `update stock_balances set quantity = $1
      where workspace_id = $2 and product_id = $3 and location_id = $4`,
    [balanceAfter, input.workspaceId, input.productId, input.locationId],
  )

  if (addsStock) {
    await addLots(tx, input, movementId)
  } else {
    await consumeLots(tx, input)
  }

  const cost = await updateCost(tx, input, balanceBefore, balanceAfter, addsStock)

  return {
    movementId,
    balanceBefore,
    balanceAfter,
    averageCost: cost.averageCost,
    inventoryValue: cost.inventoryValue,
    replayed: false,
  }
}

async function lockProduct(tx: Transaction, workspaceId: number, productId: number): Promise<ProductRow> {
  // workspace_id ikut dikueri, jadi ID produk milik workspace lain tidak bisa
  // dipakai di sini meski pemanggil sudah punya sesi yang sah (PRD 9).
  const found = await tx.query<ProductRow>(
    `select id, name, sku, unit_code, status
       from products
      where id = $1 and workspace_id = $2
      for update`,
    [productId, workspaceId],
  )
  const row = found.rows[0]
  if (!row) {
    throw new StockError('produk_tidak_ditemukan', 'Produk tidak ditemukan.', 404)
  }
  return row
}

async function lockLocation(
  tx: Transaction,
  workspaceId: number,
  locationId: number,
): Promise<LocationRow> {
  const found = await tx.query<LocationRow>(
    `select id, name from locations where id = $1 and workspace_id = $2 and not is_archived for update`,
    [locationId, workspaceId],
  )
  const row = found.rows[0]
  if (!row) {
    throw new StockError('lokasi_tidak_ditemukan', 'Lokasi tidak ditemukan.', 404)
  }
  return row
}

/**
 * Baris saldo dibuat dulu kalau belum ada, baru dikunci. select ... for update
 * saja tidak mengunci baris yang belum ada, jadi dua permintaan bersamaan bisa
 * sama-sama membuat baris dan salah satunya berakhir dengan saldo yang salah.
 */
async function lockBalance(
  tx: Transaction,
  workspaceId: number,
  productId: number,
  locationId: number,
): Promise<BalanceRow> {
  await tx.query(
    `insert into stock_balances (workspace_id, product_id, location_id, quantity)
     values ($1, $2, $3, 0)
     on conflict (product_id, location_id, workspace_id) do nothing`,
    [workspaceId, productId, locationId],
  )

  const found = await tx.query<BalanceRow>(
    `select quantity from stock_balances
      where workspace_id = $1 and product_id = $2 and location_id = $3
      for update`,
    [workspaceId, productId, locationId],
  )
  return found.rows[0]!
}

/**
 * Barang masuk membuat lot. Lot dipakai supaya tanggal kedaluwarsa per penerimaan
 * bisa ditampilkan tanpa mengubah alokasi barang keluar (A-05).
 */
async function addLots(tx: Transaction, input: RecordMovementInput, movementId: number): Promise<void> {
  await tx.query(
    `insert into stock_lots
       (workspace_id, product_id, location_id, movement_id, expires_at,
        quantity_received, quantity_remaining)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [
      input.workspaceId,
      input.productId,
      input.locationId,
      movementId,
      input.expiresAt ?? null,
      input.quantity,
    ],
  )
}

/**
 * Barang keluar mengurangi lot terlama lebih dulu. A-05 menetapkan 1.0 tidak
 * mengalokasikan FEFO, jadi urutan pengambilan tidak aerodynamic ke kedaluwarsa.
 */
async function consumeLots(tx: Transaction, input: RecordMovementInput): Promise<void> {
  const lots = await tx.query<{ id: string; quantity_remaining: string }>(
    `select id, quantity_remaining
       from stock_lots
      where workspace_id = $1 and product_id = $2 and location_id = $3
        and quantity_remaining > 0
      order by received_at asc, id asc
      for update`,
    [input.workspaceId, input.productId, input.locationId],
  )

  let remaining = input.quantity

  for (const lot of lots.rows) {
    if (remaining <= 0) {
      break
    }
    const available = asNumber(lot.quantity_remaining)
    const taken = Math.min(available, remaining)
    remaining -= taken

    await tx.query(
      `update stock_lots set quantity_remaining = quantity_remaining - $1 where id = $2`,
      [taken, lot.id],
    )
  }

  if (remaining > 0) {
    // SaldoTerpantau dijaga oleh pemanggil sebelum lot dikurangi, jadi jumlah lot
    // selalu cukup. Kalau sampai ke sini, catatan lot dan saldo sudah tidak
    // sejalan; transaksi dibatalkan lebih baik daripada movement tersimpan
    // dengan lot yang tidak bisa dijelaskan saat opname berikutnya.
    throw new StockError(
      'lot_tidak_cukup',
      'Catatan lot tidak cukup untuk jumlah ini. Produk dan lokasi perlu diperiksa lebih dulu.',
      409,
      { productId: input.productId, locationId: input.locationId, missing: remaining },
    )
  }
}

interface CostOutcome {
  averageCost: number
  inventoryValue: number
}

async function updateCost(
  tx: Transaction,
  input: RecordMovementInput,
  balanceBefore: number,
  balanceAfter: number,
  addsStock: boolean,
): Promise<CostOutcome> {
  const existing = await tx.query<CostRow>(
    `select average_cost, inventory_value from product_costs
      where product_id = $1 and workspace_id = $2
      for update`,
    [input.productId, input.workspaceId],
  )
  const current = existing.rows[0]

  const averageBefore = current ? asNumber(current.average_cost) : 0

  let averageCost: number
  let inventoryValue: number

  if (addsStock) {
    // Barang masuk yang tidak punya harga beli memakai rata-rata yang sedang
    // berlaku, supaya penyesuaian naik tidak mengacaukan harga pokok.
    const unitCost = input.unitCost ?? averageBefore
    const result = recalculateMovingAverage({
      quantityBefore: balanceBefore,
      averageCostBefore: averageBefore,
      quantityIn: input.quantity,
      unitCostIn: unitCost,
    })
    averageCost = result.averageCost
    inventoryValue = result.inventoryValue
  } else {
    averageCost = averageBefore
    inventoryValue = inventoryValueAfterOut(balanceAfter, averageCost)
  }

  await tx.query(
    `insert into product_costs (workspace_id, product_id, average_cost, inventory_value)
     values ($1, $2, $3, $4)
     on conflict (product_id, workspace_id)
       do update set average_cost = excluded.average_cost,
                     inventory_value = excluded.inventory_value`,
    [input.workspaceId, input.productId, averageCost, inventoryValue],
  )

  return { averageCost, inventoryValue }
}

/** Angka untuk pesan galat: buang nol di belakang koma, tampilkan maksimal empat angka. */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(4)))
}
