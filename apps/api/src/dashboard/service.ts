import type { Database } from '@sahabat/db'
import { derivedStockStatusLabels } from '@sahabat/shared'
import { createReport } from '../reports/service.ts'

/**
 * Data dashboard (PRD 6.7).
 *
 * Satu permintaan mengembalikan kartu ringkasan, tren, distribusi status stok,
 * dan daftar tindakan supaya halaman dashboard tidak memanggil lima endpoint
 * terpisah dan menampilkan angka yang saling berbeda waktu.
 *
 * Bagian yang boleh dibaca ditentukan pemanggil lewat `access`. Aturannya
 * mengikuti izin laporan yang sudah ada (PRD 8, B-02): peran tanpa izin laporan
 * pembelian tidak menerima kartu dan tren pembelian, begitu seterusnya. Daftar
 * utang memakai laporan utang supplier yang sudah teruji supaya angka di
 * dashboard dan di halaman laporan tidak pernah berbeda.
 *
 * Tidak ada angka contoh di sini. Workspace baru menerima nol dan daftar
 * kosong, dan halaman menampilkan langkah berikutnya.
 */

export interface DashboardFilter {
  from?: string
  to?: string
  locationId?: number
}

export interface DashboardAccess {
  stock: boolean
  sales: boolean
  purchasing: boolean
  debts: boolean
}

export interface DashboardCard {
  key: string
  label: string
  value: number
  format: 'jumlah' | 'rupiah'
  definition: string
  href: string
}

export interface TrendPoint {
  label: string
  value: number
}

export interface DashboardTrend {
  key: string
  title: string
  summary: string
  format: 'rupiah' | 'satuan'
  points: TrendPoint[]
}

export interface StockStatusRow {
  status: 'habis' | 'stok_rendah' | 'normal'
  label: string
  count: number
}

export interface ActionItem {
  label: string
  detail: string
  href: string
}

export interface DashboardAction {
  key: string
  title: string
  href: string
  empty: string
  items: ActionItem[]
}

export interface DashboardResult {
  from: string
  to: string
  locationId: number | null
  access: DashboardAccess
  cards: DashboardCard[]
  trends: DashboardTrend[]
  stockStatus: { summary: string; rows: StockStatusRow[] } | null
  actions: DashboardAction[]
}

const CARD_ORDER = ['produk-aktif', 'stok-rendah', 'po-belum-selesai', 'utang-jatuh-tempo', 'penjualan-periode', 'pembelian-periode']
const TREND_ORDER = ['penjualan-periode', 'pembelian-periode', 'stok-masuk', 'stok-keluar']
const ACTION_ORDER = ['perlu-dibeli', 'po-menunggu', 'utang-jatuh-tempo', 'hampir-kedaluwarsa']

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const tanggalTampil = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function nominal(value: unknown): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? Math.round(result) : 0
}

/** Selisih hari kalender antara dua tanggal ISO, tidak bergantung zona waktu server. */
function dayCount(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Periode lebih dari dua bulan diringkas per bulan supaya grafik tetap terbaca. */
function fillBuckets(rows: Array<{ day: string; value: number }>, from: string, to: string): TrendPoint[] {
  const perBulan = dayCount(from, to) > 62
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = perBulan ? row.day.slice(0, 7) : row.day
    totals.set(key, (totals.get(key) ?? 0) + row.value)
  }

  const keys: string[] = []
  if (perBulan) {
    let cursor = `${from.slice(0, 7)}-01`
    const last = `${to.slice(0, 7)}-01`
    while (cursor <= last) {
      keys.push(cursor)
      const year = Number(cursor.slice(0, 4))
      const month = Number(cursor.slice(5, 7))
      cursor = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
    }
  } else {
    for (let day = from; day <= to; day = addDays(day, 1)) keys.push(day)
  }

  return keys.map((key) => {
    const label = key.length === 7 ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : tanggalTampil.format(new Date(`${key}T00:00:00.000Z`))
    return { label, value: Math.round(totals.get(key) ?? 0) }
  })
}

function trendSummary(points: TrendPoint[], format: 'rupiah' | 'satuan', kosong: string): string {
  const total = points.reduce((sum, point) => sum + point.value, 0)
  if (total === 0) return kosong
  const puncak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]!)
  const nilai = format === 'rupiah' ? rupiah.format(total) : `${angka.format(total)} satuan`
  const puncakTeks = format === 'rupiah' ? rupiah.format(puncak.value) : `${angka.format(puncak.value)} satuan`
  return `Total ${nilai} pada periode ini. Tertinggi ${puncak.label} (${puncakTeks}).`
}

export async function createDashboard(
  db: Database,
  workspaceId: number,
  filter: DashboardFilter,
  access: DashboardAccess,
): Promise<DashboardResult> {
  const period = await db.query<{ today: string; month_start: string }>(
    `select (current_timestamp at time zone w.timezone)::date::text as today,
            date_trunc('month', current_timestamp at time zone w.timezone)::date::text as month_start
       from workspaces w where w.id = $1`,
    [workspaceId],
  )
  const from = filter.from ?? period.rows[0]!.month_start
  const to = filter.to ?? period.rows[0]!.today

  const cards = new Map<string, DashboardCard>()
  const trends = new Map<string, DashboardTrend>()
  const actions = new Map<string, DashboardAction>()
  let stockStatus: DashboardResult['stockStatus'] = null

  if (access.stock) {
    // Lokasi hanya ikut bila dipilih, jadi satu kueri melayani dua bentuk filter.
    const locBalances = filter.locationId ? 'and b.location_id = $2' : ''
    const stockParams: unknown[] = filter.locationId ? [workspaceId, filter.locationId] : [workspaceId]

    const aktif = await db.query<{ value: string }>(
      "select count(*)::text as value from products where workspace_id = $1 and status = 'aktif'",
      [workspaceId],
    )
    const rendah = await db.query<{ value: string }>(
      `select count(*)::text as value from products p
        where p.workspace_id = $1 and p.status = 'aktif'
          and (
            (select coalesce(sum(b.quantity), 0) from stock_balances b
              where b.workspace_id = p.workspace_id and b.product_id = p.id ${locBalances}) = 0
            or (p.min_stock is not null
                and (select coalesce(sum(b.quantity), 0) from stock_balances b
                      where b.workspace_id = p.workspace_id and b.product_id = p.id ${locBalances}) <= p.min_stock)
          )`,
      stockParams,
    )

    cards.set('produk-aktif', {
      key: 'produk-aktif',
      label: 'Produk aktif',
      value: nominal(aktif.rows[0]?.value),
      format: 'jumlah',
      definition: 'Jumlah barang berstatus aktif, tidak termasuk yang diarsipkan.',
      href: '/stok',
    })
    cards.set('stok-rendah', {
      key: 'stok-rendah',
      label: 'Stok rendah',
      value: nominal(rendah.rows[0]?.value),
      format: 'jumlah',
      definition: 'Barang aktif dengan saldo nol atau sampai di batas minimum yang diisi.',
      href: '/stok/peringatan',
    })

    const statusRows = await db.query<{ status: string; value: string }>(
      `select case
                when qty = 0 then 'habis'
                when min_stock is not null and qty <= min_stock then 'stok_rendah'
                else 'normal'
              end as status,
              count(*)::text as value
         from (
           select p.min_stock,
                  coalesce((select sum(b.quantity) from stock_balances b
                             where b.workspace_id = p.workspace_id and b.product_id = p.id ${locBalances}), 0) as qty
             from products p
            where p.workspace_id = $1 and p.status = 'aktif'
         ) t
        group by 1`,
      stockParams,
    )
    const counts = new Map(statusRows.rows.map((row) => [row.status, nominal(row.value)]))
    const statusOrder: Array<'habis' | 'stok_rendah' | 'normal'> = ['habis', 'stok_rendah', 'normal']
    const statusTotal = statusOrder.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0)
    stockStatus = statusTotal === 0
      ? { summary: 'Belum ada produk aktif. Tambahkan barang untuk melihat distribusi status stok.', rows: [] }
      : {
          summary: `${statusTotal} produk aktif: ${statusOrder.map((status) => `${counts.get(status) ?? 0} ${derivedStockStatusLabels[status].toLowerCase()}`).join(', ')}.`,
          rows: statusOrder.map((status) => ({ status, label: derivedStockStatusLabels[status], count: counts.get(status) ?? 0 })),
        }

    const perluDibeli = await db.query<Record<string, unknown>>(
      `select p.id, p.name, p.sku, p.unit_code, p.min_stock, coalesce(sum(b.quantity), 0) as qty
         from products p
         left join stock_balances b on b.product_id = p.id and b.workspace_id = p.workspace_id ${locBalances}
        where p.workspace_id = $1 and p.status = 'aktif'
        group by p.id, p.name, p.sku, p.unit_code, p.min_stock
       having coalesce(sum(b.quantity), 0) = 0
           or (p.min_stock is not null and coalesce(sum(b.quantity), 0) <= p.min_stock)
        order by p.min_stock is null, (p.min_stock - coalesce(sum(b.quantity), 0)) desc, p.name
        limit 8`,
      stockParams,
    )

    // Jendela kedaluwarsa selalu dihitung dari hari ini, bukan dari ujung
    // periode, karena daftar ini berisi tindakan yang harus dikerjakan sekarang.
    const kedaluwarsa = await db.query<Record<string, unknown>>(
      `select p.name, p.sku, p.unit_code, l.name as location_name,
              to_char(sl.expires_at, 'YYYY-MM-DD') as expires_at, sum(sl.quantity_remaining) as qty
         from stock_lots sl
         join products p on p.id = sl.product_id and p.workspace_id = sl.workspace_id
         join locations l on l.id = sl.location_id and l.workspace_id = sl.workspace_id
        where sl.workspace_id = $1 and sl.quantity_remaining > 0 and sl.expires_at is not null
          and sl.expires_at <= $2::date + 30 ${filter.locationId ? 'and sl.location_id = $3' : ''}
        group by p.name, p.sku, p.unit_code, l.name, sl.expires_at
        order by sl.expires_at, p.name
        limit 8`,
      filter.locationId ? [workspaceId, period.rows[0]!.today, filter.locationId] : [workspaceId, period.rows[0]!.today],
    )

    const movements = await db.query<Record<string, unknown>>(
      `select to_char(m.occurred_on, 'YYYY-MM-DD') as day, m.direction, sum(m.quantity) as qty
         from stock_movements m
        where m.workspace_id = $1 and m.occurred_on between $2 and $3 ${filter.locationId ? 'and m.location_id = $4' : ''}
        group by m.occurred_on, m.direction order by m.occurred_on`,
      filter.locationId ? [workspaceId, from, to, filter.locationId] : [workspaceId, from, to],
    )
    const masuk = movements.rows.filter((row) => row.direction === 'tambah').map((row) => ({ day: String(row.day), value: nominal(row.qty) }))
    const keluar = movements.rows.filter((row) => row.direction === 'kurang').map((row) => ({ day: String(row.day), value: nominal(row.qty) }))

    trends.set('stok-masuk', {
      key: 'stok-masuk',
      title: 'Stok masuk per hari',
      summary: trendSummary(fillBuckets(masuk, from, to), 'satuan', 'Belum ada stok masuk pada periode ini.'),
      format: 'satuan',
      points: fillBuckets(masuk, from, to),
    })
    trends.set('stok-keluar', {
      key: 'stok-keluar',
      title: 'Stok keluar per hari',
      summary: trendSummary(fillBuckets(keluar, from, to), 'satuan', 'Belum ada stok keluar pada periode ini.'),
      format: 'satuan',
      points: fillBuckets(keluar, from, to),
    })

    actions.set('perlu-dibeli', {
      key: 'perlu-dibeli',
      title: 'Barang yang perlu dibeli',
      href: '/stok/peringatan',
      empty: 'Semua barang masih di atas batas minimum. Tidak ada yang perlu dibeli sekarang.',
      items: perluDibeli.rows.map((row) => {
        const qty = nominal(row.qty)
        const min = row.min_stock === null ? null : nominal(row.min_stock)
        const detail = min === null
          ? `Stok habis, satuan ${String(row.unit_code)}`
          : `Sisa ${angka.format(qty)} dari batas minimum ${angka.format(min)} ${String(row.unit_code)}`
        return { label: `${String(row.name)} (${String(row.sku)})`, detail, href: '/stok/peringatan' }
      }),
    })
    actions.set('hampir-kedaluwarsa', {
      key: 'hampir-kedaluwarsa',
      title: 'Barang mendekati kedaluwarsa',
      href: '/stok/peringatan',
      empty: 'Tidak ada barang yang mendekati kedaluwarsa dalam 30 hari ke depan.',
      items: kedaluwarsa.rows.map((row) => ({
        label: `${String(row.name)} (${String(row.sku)})`,
        detail: `Kedaluwarsa ${tanggalTampil.format(new Date(`${String(row.expires_at)}T00:00:00.000Z`))}, sisa ${angka.format(nominal(row.qty))} ${String(row.unit_code)} di ${String(row.location_name)}`,
        href: '/stok/peringatan',
      })),
    })
  }

  if (access.purchasing) {
    const locOrders = filter.locationId ? 'and location_id = $2' : ''
    const orderParams: unknown[] = filter.locationId ? [workspaceId, filter.locationId] : [workspaceId]

    const belumSelesai = await db.query<{ value: string }>(
      `select count(*)::text as value from purchase_orders
        where workspace_id = $1
          and status in ('draft', 'diajukan', 'disetujui', 'diterima_sebagian') ${locOrders}`,
      orderParams,
    )
    cards.set('po-belum-selesai', {
      key: 'po-belum-selesai',
      label: 'PO belum selesai',
      value: nominal(belumSelesai.rows[0]?.value),
      format: 'jumlah',
      definition: 'Purchase order dari draft sampai diterima sebagian, belum ditutup atau dibatalkan.',
      href: '/pembelian/po',
    })

    const locUntukPenerimaan = filter.locationId ? 'and r.location_id = $4' : ''
    const locUntukRetur = filter.locationId ? 'and pr.location_id = $4' : ''
    const purchaseParams: unknown[] = filter.locationId ? [workspaceId, from, to, filter.locationId] : [workspaceId, from, to]

    const beli = await db.query<Record<string, unknown>>(
      `with penerimaan as (
         select r.received_on as day, sum(i.quantity * i.unit_price) as value
           from goods_receipt_items i
           join goods_receipts r on r.id = i.goods_receipt_id and r.workspace_id = i.workspace_id
          where i.workspace_id = $1 and r.received_on between $2 and $3 ${locUntukPenerimaan}
          group by r.received_on
       ), retur as (
         select pr.returned_on as day, sum(t.quantity * t.unit_price) as value
           from purchase_return_items t
           join purchase_returns pr on pr.id = t.purchase_return_id and pr.workspace_id = t.workspace_id
          where t.workspace_id = $1 and pr.returned_on between $2 and $3 ${locUntukRetur}
          group by pr.returned_on
       )
       select to_char(coalesce(pe.day, re.day), 'YYYY-MM-DD') as day,
              coalesce(pe.value, 0) - coalesce(re.value, 0) as value
         from penerimaan pe full join retur re on pe.day = re.day order by 1`,
      purchaseParams,
    )
    const beliRows = beli.rows.map((row) => ({ day: String(row.day), value: nominal(row.value) }))
    cards.set('pembelian-periode', {
      key: 'pembelian-periode',
      label: 'Pembelian periode',
      value: beliRows.reduce((sum, row) => sum + row.value, 0),
      format: 'rupiah',
      definition: 'Nilai penerimaan barang pada periode dikurangi nilai retur pembelian pada periode yang sama.',
      href: '/laporan?laporan=purchases',
    })
    trends.set('pembelian-periode', {
      key: 'pembelian-periode',
      title: 'Pembelian per hari',
      summary: trendSummary(fillBuckets(beliRows, from, to), 'rupiah', 'Belum ada penerimaan pembelian pada periode ini.'),
      format: 'rupiah',
      points: fillBuckets(beliRows, from, to),
    })

    const menunggu = await db.query<Record<string, unknown>>(
      `select o.id, o.number, o.total_amount, to_char(o.ordered_on, 'YYYY-MM-DD') as ordered_on, s.name as supplier
         from purchase_orders o
         join suppliers s on s.id = o.supplier_id and s.workspace_id = o.workspace_id
        where o.workspace_id = $1 and o.status = 'diajukan' ${filter.locationId ? 'and o.location_id = $2' : ''}
        order by o.ordered_on, o.id limit 8`,
      orderParams,
    )
    actions.set('po-menunggu', {
      key: 'po-menunggu',
      title: 'PO menunggu persetujuan',
      href: '/pembelian/po',
      empty: 'Tidak ada PO yang menunggu persetujuan.',
      items: menunggu.rows.map((row) => ({
        label: `${String(row.number)} · ${String(row.supplier)}`,
        detail: `Diajukan ${tanggalTampil.format(new Date(`${String(row.ordered_on)}T00:00:00.000Z`))}, total ${rupiah.format(nominal(row.total_amount))}`,
        href: `/pembelian/po/${String(row.id)}`,
      })),
    })
  }

  if (access.sales) {
    const locSales = filter.locationId ? 'and location_id = $4' : ''
    const salesParams: unknown[] = filter.locationId ? [workspaceId, from, to, filter.locationId] : [workspaceId, from, to]
    const penjualan = await db.query<Record<string, unknown>>(
      `select to_char(sold_on, 'YYYY-MM-DD') as day, sum(total_amount) as value
         from sales
        where workspace_id = $1 and status = 'selesai' and sold_on between $2 and $3 ${locSales}
        group by sold_on order by sold_on`,
      salesParams,
    )
    const salesRows = penjualan.rows.map((row) => ({ day: String(row.day), value: nominal(row.value) }))

    cards.set('penjualan-periode', {
      key: 'penjualan-periode',
      label: 'Penjualan periode',
      value: salesRows.reduce((sum, row) => sum + row.value, 0),
      format: 'rupiah',
      definition: 'Nilai penjualan berstatus selesai pada periode. Penjualan yang dibatalkan tidak dihitung.',
      href: '/laporan?laporan=sales',
    })
    trends.set('penjualan-periode', {
      key: 'penjualan-periode',
      title: 'Penjualan per hari',
      summary: trendSummary(fillBuckets(salesRows, from, to), 'rupiah', 'Belum ada penjualan pada periode ini.'),
      format: 'rupiah',
      points: fillBuckets(salesRows, from, to),
    })
  }

  if (access.debts) {
    const laporan = await createReport(db, workspaceId, 'debts', {})
    const rows = laporan.rows as Array<{ supplier: string; dueOn: string | null; outstanding: number; overdueDays: number | null }>
    const lewat = rows.filter((row) => (row.overdueDays ?? 0) > 0)

    cards.set('utang-jatuh-tempo', {
      key: 'utang-jatuh-tempo',
      label: 'Utang jatuh tempo',
      value: lewat.reduce((sum, row) => sum + row.outstanding, 0),
      format: 'rupiah',
      definition: 'Sisa utang supplier yang sudah melewati jatuh tempo tertua yang belum lunas.',
      href: '/pembelian/pembayaran',
    })

    actions.set('utang-jatuh-tempo', {
      key: 'utang-jatuh-tempo',
      title: 'Utang supplier jatuh tempo',
      href: '/pembelian/pembayaran',
      empty: 'Tidak ada utang supplier yang melewati jatuh tempo.',
      items: lewat
        .sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0))
        .slice(0, 8)
        .map((row) => ({
          label: row.supplier,
          detail: row.dueOn === null
            ? `Sisa ${rupiah.format(row.outstanding)}, sudah lewat ${row.overdueDays} hari`
            : `Jatuh tempo ${tanggalTampil.format(new Date(`${row.dueOn}T00:00:00.000Z`))}, sisa ${rupiah.format(row.outstanding)}, lewat ${row.overdueDays} hari`,
          href: '/pembelian/pembayaran',
        })),
    })
  }

  return {
    from,
    to,
    locationId: filter.locationId ?? null,
    access,
    cards: CARD_ORDER.flatMap((key) => (cards.has(key) ? [cards.get(key)!] : [])),
    trends: TREND_ORDER.flatMap((key) => (trends.has(key) ? [trends.get(key)!] : [])),
    stockStatus,
    actions: ACTION_ORDER.flatMap((key) => (actions.has(key) ? [actions.get(key)!] : [])),
  }
}
