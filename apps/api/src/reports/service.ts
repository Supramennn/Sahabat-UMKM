import type { Sql } from '@sahabat/db'
import { StockError } from '../stock/movements.ts'

export const reportKinds = [
  'stock',
  'movements',
  'stocktake',
  'purchases',
  'debts',
  'sales',
  'gross-profit',
  'expenses',
  'monthly',
] as const

export type ReportKind = (typeof reportKinds)[number]
export type ReportValue = string | number | null

export interface ReportResult {
  kind: ReportKind
  title: string
  definition: string
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, ReportValue>>
}

export interface ReportFilter {
  from?: string
  to?: string
  locationId?: number
  supplierId?: number
}

const descriptions: Record<ReportKind, { title: string; definition: string; columns: Array<{ key: string; label: string }> }> = {
  stock: {
    title: 'Posisi stok',
    definition: 'Saldo stok per produk dan lokasi. Nilai persediaan dihitung dari saldo dikali harga pokok rata-rata bergerak saat ini.',
    columns: [
      { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Produk' }, { key: 'location', label: 'Lokasi' },
      { key: 'quantity', label: 'Saldo' }, { key: 'unit', label: 'Satuan' }, { key: 'averageCost', label: 'Harga pokok rata-rata (Rp)' },
      { key: 'inventoryValue', label: 'Nilai persediaan (Rp)' }, { key: 'earliestExpiry', label: 'Kedaluwarsa terdekat' },
    ],
  },
  movements: {
    title: 'Pergerakan stok',
    definition: 'Baris ledger stok sesuai filter tanggal dan lokasi. Koreksi dan selisih opname tercatat sebagai pergerakan baru.',
    columns: [
      { key: 'date', label: 'Tanggal' }, { key: 'product', label: 'Produk' }, { key: 'sku', label: 'SKU' },
      { key: 'location', label: 'Lokasi' }, { key: 'kind', label: 'Jenis' }, { key: 'direction', label: 'Arah' },
      { key: 'quantity', label: 'Jumlah' }, { key: 'balanceBefore', label: 'Saldo sebelum' },
      { key: 'balanceAfter', label: 'Saldo sesudah' }, { key: 'reason', label: 'Alasan' }, { key: 'reference', label: 'Referensi' },
    ],
  },
  stocktake: {
    title: 'Hasil stok opname',
    definition: 'Selisih dihitung dari jumlah fisik yang disimpan dikurangi saldo sistem saat sesi dibuka. Hanya hasil yang sudah dihitung ditampilkan.',
    columns: [
      { key: 'date', label: 'Tanggal sesi' }, { key: 'location', label: 'Lokasi' }, { key: 'product', label: 'Produk' },
      { key: 'sku', label: 'SKU' }, { key: 'systemQuantity', label: 'Saldo sistem saat sesi dibuka' },
      { key: 'countedQuantity', label: 'Jumlah fisik' }, { key: 'variance', label: 'Selisih' }, { key: 'status', label: 'Status sesi' },
    ],
  },
  purchases: {
    title: 'Pembelian',
    definition: 'Total nilai PO yang memiliki penerimaan dalam periode, setelah retur yang tercatat pada periode dikurangkan dari nilai PO. PO tanpa penerimaan dalam periode tidak ditampilkan.',
    columns: [
      { key: 'date', label: 'Tanggal PO' }, { key: 'orderNumber', label: 'Nomor PO' }, { key: 'supplier', label: 'Supplier' },
      { key: 'location', label: 'Lokasi' }, { key: 'status', label: 'Status PO' }, { key: 'receivedValue', label: 'Nilai diterima (Rp)' },
      { key: 'returnedValue', label: 'Nilai retur periode ini (Rp)' }, { key: 'netValue', label: 'Pembelian bersih periode ini (Rp)' },
    ],
  },
  debts: {
    title: 'Utang supplier dan umur utang',
    definition: 'Saldo berjalan adalah seluruh penerimaan dikurangi retur dan pembayaran yang dialokasikan. Umur utang adalah hari keterlambatan terhadap jatuh tempo tertua yang belum lunas.',
    columns: [
      { key: 'supplier', label: 'Supplier' }, { key: 'dueOn', label: 'Jatuh tempo tertua' },
      { key: 'debt', label: 'Penerimaan dan retur (Rp)' }, { key: 'paid', label: 'Pembayaran (Rp)' },
      { key: 'outstanding', label: 'Sisa utang (Rp)' }, { key: 'overdueDays', label: 'Terlambat (hari)' },
    ],
  },
  sales: {
    title: 'Penjualan',
    definition: 'Nilai penjualan yang selesai setelah diskon, dikelompokkan per produk dan lokasi. Penjualan yang dibatalkan tidak dihitung.',
    columns: [
      { key: 'period', label: 'Periode' }, { key: 'product', label: 'Produk' }, { key: 'sku', label: 'SKU' },
      { key: 'location', label: 'Lokasi' }, { key: 'quantity', label: 'Jumlah terjual' }, { key: 'sales', label: 'Penjualan (Rp)' },
    ],
  },
  'gross-profit': {
    title: 'Laba kotor',
    definition: 'Penjualan setelah diskon dikurangi harga pokok yang disimpan saat transaksi penjualan dibuat. Ini bukan laba bersih dan bukan pengganti akuntansi.',
    columns: [
      { key: 'period', label: 'Periode' }, { key: 'product', label: 'Produk' }, { key: 'sku', label: 'SKU' },
      { key: 'location', label: 'Lokasi' }, { key: 'sales', label: 'Penjualan (Rp)' }, { key: 'cost', label: 'Harga pokok (Rp)' },
      { key: 'grossProfit', label: 'Laba kotor (Rp)' },
    ],
  },
  expenses: {
    title: 'Pengeluaran operasional',
    definition: 'Pengeluaran operasional di luar pembelian barang dagangan, dikelompokkan per kategori dan periode.',
    columns: [
      { key: 'period', label: 'Periode' }, { key: 'category', label: 'Kategori' }, { key: 'count', label: 'Jumlah transaksi' },
      { key: 'amount', label: 'Pengeluaran (Rp)' },
    ],
  },
  monthly: {
    title: 'Ringkasan bulanan',
    definition: 'Ringkasan penjualan, pembelian bersih, pengeluaran, laba kotor, dan jumlah selisih opname bersih per bulan. Pengeluaran ditampilkan terpisah; tidak dihitung sebagai laba bersih.',
    columns: [
      { key: 'period', label: 'Bulan' }, { key: 'sales', label: 'Penjualan (Rp)' }, { key: 'purchases', label: 'Pembelian bersih (Rp)' },
      { key: 'expenses', label: 'Pengeluaran (Rp)' }, { key: 'grossProfit', label: 'Laba kotor (Rp)' },
      { key: 'stockVariance', label: 'Selisih opname bersih (satuan stok)' },
    ],
  },
}

function dateFilters(alias: string, filter: ReportFilter, params: unknown[]): string[] {
  const clauses: string[] = []
  if (filter.from) {
    params.push(filter.from)
    clauses.push(`${alias} >= $${params.length}`)
  }
  if (filter.to) {
    params.push(filter.to)
    clauses.push(`${alias} <= $${params.length}`)
  }
  return clauses
}

function locationFilter(alias: string, filter: ReportFilter, params: unknown[]): string | null {
  if (!filter.locationId) return null
  params.push(filter.locationId)
  return `${alias} = $${params.length}`
}

function number(value: unknown): number {
  const result = Number(value ?? 0)
  if (!Number.isFinite(result)) throw new StockError('laporan_tidak_valid', 'Data laporan tidak dapat dihitung.')
  return result
}

export async function createReport(db: Sql, workspaceId: number, kind: ReportKind, filter: ReportFilter): Promise<ReportResult> {
  const definition = descriptions[kind]
  let result: Array<Record<string, ReportValue>>

  if (kind === 'stock') {
    const params: unknown[] = [workspaceId]
    const location = locationFilter('l.id', filter, params)
    const rows = await db.query<Record<string, unknown>>(
      `select p.sku, p.name as product, l.name as location, b.quantity, p.unit_code as unit,
              coalesce(pc.average_cost, 0) as average_cost,
              round(b.quantity * coalesce(pc.average_cost, 0)) as inventory_value,
              (select to_char(min(sl.expires_at), 'YYYY-MM-DD') from stock_lots sl
                where sl.workspace_id = b.workspace_id and sl.product_id = b.product_id
                  and sl.location_id = b.location_id and sl.quantity_remaining > 0 and sl.expires_at is not null) as earliest_expiry
         from products p join locations l on l.workspace_id = p.workspace_id
         left join stock_balances b on b.product_id = p.id and b.workspace_id = p.workspace_id and b.location_id = l.id
         left join product_costs pc on pc.product_id = p.id and pc.workspace_id = p.workspace_id
        where p.workspace_id = $1 ${location ? `and ${location}` : ''} order by p.name, l.name`, params,
    )
    result = rows.rows.map((row) => ({ sku: String(row.sku), product: String(row.product), location: String(row.location), quantity: number(row.quantity), unit: String(row.unit), averageCost: number(row.average_cost), inventoryValue: number(row.inventory_value), earliestExpiry: row.earliest_expiry as string | null }))
  } else if (kind === 'movements') {
    const params: unknown[] = [workspaceId]
    const where = ['m.workspace_id = $1']
    where.push(...dateFilters('m.occurred_on', filter, params))
    const location = locationFilter('m.location_id', filter, params)
    if (location) where.push(location)
    const rows = await db.query<Record<string, unknown>>(
      `select to_char(m.occurred_on, 'YYYY-MM-DD') as date, p.name as product, p.sku, l.name as location,
              m.kind, m.direction, m.quantity, m.balance_before, m.balance_after,
              m.reason_code as reason, m.reference
         from stock_movements m join products p on p.id = m.product_id and p.workspace_id = m.workspace_id
         join locations l on l.id = m.location_id and l.workspace_id = m.workspace_id
        where ${where.join(' and ')} order by m.occurred_on desc, m.id desc`, params,
    )
    result = rows.rows.map((row) => ({ date: String(row.date), product: String(row.product), sku: String(row.sku), location: String(row.location), kind: String(row.kind), direction: String(row.direction), quantity: number(row.quantity), balanceBefore: number(row.balance_before), balanceAfter: number(row.balance_after), reason: String(row.reason), reference: row.reference as string | null }))
  } else if (kind === 'stocktake') {
    const params: unknown[] = [workspaceId]
    const where = ['i.workspace_id = $1', 'i.counted_at is not null']
    where.push(...dateFilters('c.started_at::date', filter, params))
    const location = locationFilter('c.location_id', filter, params)
    if (location) where.push(location)
    const rows = await db.query<Record<string, unknown>>(
      `select to_char(c.started_at, 'YYYY-MM-DD') as date, l.name as location, p.name as product, p.sku,
              i.system_quantity, i.counted_quantity, i.counted_quantity - i.system_quantity as variance, c.status
         from stock_count_items i join stock_counts c on c.id = i.count_id and c.workspace_id = i.workspace_id
         join locations l on l.id = c.location_id and l.workspace_id = c.workspace_id
         join products p on p.id = i.product_id and p.workspace_id = i.workspace_id
        where ${where.join(' and ')} order by c.started_at desc, p.name`, params,
    )
    result = rows.rows.map((row) => ({ date: String(row.date), location: String(row.location), product: String(row.product), sku: String(row.sku), systemQuantity: number(row.system_quantity), countedQuantity: number(row.counted_quantity), variance: number(row.variance), status: String(row.status) }))
  } else if (kind === 'purchases') {
    const params: unknown[] = [workspaceId]
    const clauses = ['o.workspace_id = $1', 'exists (select 1 from goods_receipts r where r.workspace_id = o.workspace_id and r.purchase_order_id = o.id)']
    if (filter.from) { params.push(filter.from); clauses.push(`exists (select 1 from goods_receipts r where r.workspace_id = o.workspace_id and r.purchase_order_id = o.id and r.received_on >= $${params.length})`) }
    if (filter.to) { params.push(filter.to); clauses.push(`exists (select 1 from goods_receipts r where r.workspace_id = o.workspace_id and r.purchase_order_id = o.id and r.received_on <= $${params.length})`) }
    if (filter.supplierId) { params.push(filter.supplierId); clauses.push(`o.supplier_id = $${params.length}`) }
    const location = locationFilter('o.location_id', filter, params)
    if (location) clauses.push(location)
    const rows = await db.query<Record<string, unknown>>(
      `select to_char(o.ordered_on, 'YYYY-MM-DD') as date, o.number as order_number, s.name as supplier,
              l.name as location, o.status, o.total_amount,
              coalesce((select round(sum(i.unit_price * i.quantity)) from goods_receipt_items i join goods_receipts r
                on r.id = i.goods_receipt_id and r.workspace_id = i.workspace_id
                where r.purchase_order_id = o.id and r.workspace_id = o.workspace_id
                  ${filter.from ? `and r.received_on >= $${params.indexOf(filter.from) + 1}` : ''}
                  ${filter.to ? `and r.received_on <= $${params.indexOf(filter.to) + 1}` : ''}), 0) as received_value,
              coalesce((select round(sum(i.quantity * i.unit_price)) from purchase_return_items i join purchase_returns r
                on r.id = i.purchase_return_id and r.workspace_id = i.workspace_id
                where r.purchase_order_id = o.id and r.workspace_id = o.workspace_id
                  ${filter.from ? `and r.returned_on >= $${params.indexOf(filter.from) + 1}` : ''}
                  ${filter.to ? `and r.returned_on <= $${params.indexOf(filter.to) + 1}` : ''}), 0) as returned_value
         from purchase_orders o join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
         join locations l on l.id = o.location_id and l.workspace_id = o.workspace_id
        where ${clauses.join(' and ')} order by o.ordered_on desc, o.id desc`, params,
    )
    result = rows.rows.map((row) => { const receivedValue = number(row.received_value); const returnedValue = number(row.returned_value); return { date: String(row.date), orderNumber: String(row.order_number), supplier: String(row.supplier), location: String(row.location), status: String(row.status), receivedValue, returnedValue, netValue: receivedValue - returnedValue } })
  } else if (kind === 'debts') {
    const params: unknown[] = [workspaceId]
    const clauses = ['e.workspace_id = $1']
    if (filter.supplierId) { params.push(filter.supplierId); clauses.push(`e.supplier_id = $${params.length}`) }
    const rows = await db.query<Record<string, unknown>>(
      `select s.name as supplier,
              case when s.payment_term_days is not null then to_char(min(e.entry_date + s.payment_term_days) filter (where e.amount > 0), 'YYYY-MM-DD') end as due_on,
              sum(e.amount) as debt,
              coalesce((select sum(p.amount) from supplier_payments p where p.workspace_id = e.workspace_id
                and p.supplier_id = e.supplier_id), 0) as paid,
              case when s.payment_term_days is not null then greatest(0, current_date - min(e.entry_date + s.payment_term_days) filter (where e.amount > 0)) end as overdue_days
         from supplier_debt_entries e join suppliers s on s.id = e.supplier_id and s.workspace_id = e.workspace_id
        where ${clauses.join(' and ')} group by e.workspace_id, e.supplier_id, s.name, s.payment_term_days
       having sum(e.amount) - coalesce((select sum(p.amount) from supplier_payments p where p.workspace_id = e.workspace_id
         and p.supplier_id = e.supplier_id), 0) <> 0
        order by overdue_days desc nulls last, s.name`, params,
    )
    result = rows.rows.map((row) => { const debt = number(row.debt); const paid = number(row.paid); return { supplier: String(row.supplier), dueOn: row.due_on as string | null, debt, paid, outstanding: debt - paid, overdueDays: row.overdue_days === null ? null : number(row.overdue_days) } })
  } else if (kind === 'sales' || kind === 'gross-profit') {
    const params: unknown[] = [workspaceId]
    const clauses = ["s.workspace_id = $1", "s.status = 'selesai'"]
    clauses.push(...dateFilters('s.sold_on', filter, params))
    const location = locationFilter('s.location_id', filter, params)
    if (location) clauses.push(location)
    const rows = await db.query<Record<string, unknown>>(
      `select to_char(date_trunc('month', s.sold_on), 'YYYY-MM') as period, p.name as product, p.sku,
              l.name as location, sum(i.quantity) as quantity,
              sum(case when s.subtotal = 0 then 0 else round(i.line_total * s.total_amount::numeric / s.subtotal) end) as sales,
              sum(i.cost_total) as cost
         from sales s join sale_items i on i.sale_id = s.id and i.workspace_id = s.workspace_id
         join products p on p.id = i.product_id and p.workspace_id = i.workspace_id
         join locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
        where ${clauses.join(' and ')} group by date_trunc('month', s.sold_on), p.id, l.id
        order by period desc, p.name, l.name`, params,
    )
    result = rows.rows.map((row) => { const sales = number(row.sales); const cost = number(row.cost); const base = { period: String(row.period), product: String(row.product), sku: String(row.sku), location: String(row.location) }; return kind === 'sales' ? { ...base, quantity: number(row.quantity), sales } : { ...base, sales, cost, grossProfit: sales - cost } })
  } else if (kind === 'expenses') {
    const params: unknown[] = [workspaceId]
    const clauses = ['e.workspace_id = $1']
    clauses.push(...dateFilters('e.spent_on', filter, params))
    const rows = await db.query<Record<string, unknown>>(
      `select to_char(date_trunc('month', e.spent_on), 'YYYY-MM') as period,
              coalesce(c.name, 'Tanpa kategori') as category, count(*) as count, sum(e.amount) as amount
         from expenses e left join expense_categories c on c.id = e.category_id and c.workspace_id = e.workspace_id
        where ${clauses.join(' and ')} group by date_trunc('month', e.spent_on), c.id, c.name
        order by period desc, category`, params,
    )
    result = rows.rows.map((row) => ({ period: String(row.period), category: String(row.category), count: number(row.count), amount: number(row.amount) }))
  } else {
    const params: unknown[] = [workspaceId]
    const clausesSales = ["workspace_id = $1", "status = 'selesai'"]
    clausesSales.push(...dateFilters('sold_on', filter, params))
    const sales = await db.query<Record<string, unknown>>(`select to_char(date_trunc('month', sold_on), 'YYYY-MM') as period, sum(total_amount) as sales, sum(total_amount - cost_total) as gross
      from sales where ${clausesSales.join(' and ')} group by date_trunc('month', sold_on)`, params)
    const paramsPurchase: unknown[] = [workspaceId]
    const clausesReceipts = ['r.workspace_id = $1']
    clausesReceipts.push(...dateFilters('r.received_on', filter, paramsPurchase))
    const receipts = await db.query<Record<string, unknown>>(`select to_char(date_trunc('month', r.received_on), 'YYYY-MM') as period, round(sum(i.unit_price * i.quantity)) as amount
      from goods_receipts r join goods_receipt_items i on i.goods_receipt_id = r.id and i.workspace_id = r.workspace_id
      where ${clausesReceipts.join(' and ')} group by date_trunc('month', r.received_on)`, paramsPurchase)
    const paramsReturns: unknown[] = [workspaceId]
    const clausesReturns = ['r.workspace_id = $1']
    clausesReturns.push(...dateFilters('r.returned_on', filter, paramsReturns))
    const returns = await db.query<Record<string, unknown>>(`select to_char(date_trunc('month', r.returned_on), 'YYYY-MM') as period, round(sum(i.unit_price * i.quantity)) as amount
      from purchase_returns r join purchase_return_items i on i.purchase_return_id = r.id and i.workspace_id = r.workspace_id
      where ${clausesReturns.join(' and ')} group by date_trunc('month', r.returned_on)`, paramsReturns)
    const paramsExpenses: unknown[] = [workspaceId]
    const clausesExpenses = ['workspace_id = $1']
    clausesExpenses.push(...dateFilters('spent_on', filter, paramsExpenses))
    const expenses = await db.query<Record<string, unknown>>(`select to_char(date_trunc('month', spent_on), 'YYYY-MM') as period, sum(amount) as amount
      from expenses where ${clausesExpenses.join(' and ')} group by date_trunc('month', spent_on)`, paramsExpenses)
    const paramsStock: unknown[] = [workspaceId]
    const clausesStock = ["m.workspace_id = $1", "m.kind = 'opname_selisih'"]
    clausesStock.push(...dateFilters('m.occurred_on', filter, paramsStock))
    const variance = await db.query<Record<string, unknown>>(`select to_char(date_trunc('month', m.occurred_on), 'YYYY-MM') as period,
       sum(case when m.direction = 'tambah' then m.quantity else -m.quantity end) as variance
      from stock_movements m
      where ${clausesStock.join(' and ')} group by date_trunc('month', m.occurred_on)`, paramsStock)
    const values = new Map<string, { sales: number; grossProfit: number; purchases: number; expenses: number; stockVariance: number }>()
    const entry = (period: string) => { const found = values.get(period); if (found) return found; const fresh = { sales: 0, grossProfit: 0, purchases: 0, expenses: 0, stockVariance: 0 }; values.set(period, fresh); return fresh }
    for (const row of sales.rows) { const item = entry(String(row.period)); item.sales = number(row.sales); item.grossProfit = number(row.gross) }
    for (const row of receipts.rows) entry(String(row.period)).purchases += number(row.amount)
    for (const row of returns.rows) entry(String(row.period)).purchases -= number(row.amount)
    for (const row of expenses.rows) entry(String(row.period)).expenses = number(row.amount)
    for (const row of variance.rows) entry(String(row.period)).stockVariance = number(row.variance)
    result = [...values].sort(([a], [b]) => b.localeCompare(a)).map(([period, values]) => ({ period, ...values }))
  }

  return { kind, ...definition, rows: result }
}
