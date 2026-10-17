import type { Database } from '@sahabat/db'
import type { ZipEntry } from './zip.ts'

/**
 * Ekspor seluruh data workspace (PRD 6.8).
 *
 * Satu tabel menjadi satu berkas CSV, dan id baris dipertahankan apa adanya
 * supaya hubungan antar berkas tetap bisa ditelusuri setelah diunduh (mis.
 * produk_id di pergerakan-stok.csv menunjuk ke id di produk.csv). Yang tidak
 * ikut adalah data teknis dan rahasia: kata sandi, sesi, token, kode MFA, log
 * audit, dan berkas lampiran biner. Daftar itu disebutkan lagi di PANDUAN.txt
 * supaya pengguna tidak menduga-duga isi arsip.
 *
 * Semua kueri memakai satu parameter workspace, jadi tidak ada cara satu
 * workspace membaca baris workspace lain lewat jalur ini. Setiap kolom diberi
 * alias yang sama dengan judul kolom CSV, supaya isi berkas tidak pernah
 * bergeser dari judulnya.
 */

interface Dataset {
  file: string
  headers: string[]
  sql: string
}

const TIMESTAMP = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')`

const datasets: Dataset[] = [
  {
    file: 'profil-usaha.csv',
    headers: ['nama', 'jenis_usaha', 'zona_waktu', 'mata_uang', 'format_tanggal', 'dibuat'],
    sql: `select name as nama, business_type as jenis_usaha, timezone as zona_waktu, currency as mata_uang,
                 date_format as format_tanggal, ${TIMESTAMP('created_at')} as dibuat
            from workspaces where id = $1`,
  },
  {
    file: 'pengaturan-usaha.csv',
    headers: ['persetujuan_po', 'ambang_persetujuan', 'metode_harga_pokok', 'diperbarui'],
    sql: `select approval_required::text as persetujuan_po, approval_threshold_amount::text as ambang_persetujuan,
                 costing_method as metode_harga_pokok, ${TIMESTAMP('updated_at')} as diperbarui
            from workspace_settings where workspace_id = $1`,
  },
  {
    file: 'anggota.csv',
    headers: ['id_pengguna', 'nama', 'email', 'peran', 'bergabung', 'dikeluarkan'],
    sql: `select m.user_id::text as id_pengguna, u.name as nama, u.email as email, m.role as peran,
                 ${TIMESTAMP('m.joined_at')} as bergabung, ${TIMESTAMP('m.removed_at')} as dikeluarkan
            from memberships m join users u on u.id = m.user_id
           where m.workspace_id = $1 order by m.id`,
  },
  {
    file: 'lokasi.csv',
    headers: ['id', 'nama', 'kode', 'diarsipkan', 'dibuat'],
    sql: `select id::text as id, name as nama, code as kode, is_archived::text as diarsipkan,
                 ${TIMESTAMP('created_at')} as dibuat
            from locations where workspace_id = $1 order by id`,
  },
  {
    file: 'kategori-produk.csv',
    headers: ['id', 'nama', 'dibuat'],
    sql: `select id::text as id, name as nama, ${TIMESTAMP('created_at')} as dibuat
            from categories where workspace_id = $1 order by id`,
  },
  {
    file: 'produk.csv',
    headers: ['id', 'sku', 'nama', 'kategori_id', 'satuan', 'harga_beli_referensi', 'harga_jual', 'stok_minimum', 'status'],
    sql: `select id::text as id, sku as sku, name as nama, category_id::text as kategori_id, unit_code as satuan,
                 reference_purchase_price::text as harga_beli_referensi, selling_price::text as harga_jual,
                 trim_scale(min_stock)::text as stok_minimum, status as status
            from products where workspace_id = $1 order by id`,
  },
  {
    file: 'harga-pokok-produk.csv',
    headers: ['produk_id', 'harga_pokok_rata_rata', 'nilai_persediaan', 'diperbarui'],
    sql: `select product_id::text as produk_id, trim_scale(average_cost)::text as harga_pokok_rata_rata,
                 inventory_value::text as nilai_persediaan, ${TIMESTAMP('updated_at')} as diperbarui
            from product_costs where workspace_id = $1 order by product_id`,
  },
  {
    file: 'saldo-stok.csv',
    headers: ['produk_id', 'lokasi_id', 'jumlah'],
    sql: `select product_id::text as produk_id, location_id::text as lokasi_id, trim_scale(quantity)::text as jumlah
            from stock_balances where workspace_id = $1 and quantity <> 0
           order by product_id, location_id`,
  },
  {
    file: 'pergerakan-stok.csv',
    headers: ['id', 'tanggal', 'produk_id', 'lokasi_id', 'jenis', 'arah', 'jumlah', 'harga_satuan', 'saldo_sebelum', 'saldo_sesudah', 'alasan', 'referensi', 'pelaku_id', 'catatan'],
    sql: `select id::text as id, to_char(occurred_on, 'YYYY-MM-DD') as tanggal, product_id::text as produk_id,
                 location_id::text as lokasi_id, kind as jenis, direction as arah,
                 trim_scale(quantity)::text as jumlah, unit_cost::text as harga_satuan,
                 trim_scale(balance_before)::text as saldo_sebelum, trim_scale(balance_after)::text as saldo_sesudah,
                 reason_code as alasan, reference as referensi, actor_user_id::text as pelaku_id, note as catatan
            from stock_movements where workspace_id = $1 order by id`,
  },
  {
    file: 'opname-stok.csv',
    headers: ['id', 'lokasi_id', 'status', 'catatan', 'dimulai_oleh', 'dimulai', 'disetujui_oleh', 'disetujui'],
    sql: `select id::text as id, location_id::text as lokasi_id, status as status, note as catatan,
                 started_by::text as dimulai_oleh, ${TIMESTAMP('started_at')} as dimulai,
                 approved_by::text as disetujui_oleh, ${TIMESTAMP('approved_at')} as disetujui
            from stock_counts where workspace_id = $1 order by id`,
  },
  {
    file: 'opname-stok-baris.csv',
    headers: ['id', 'opname_id', 'produk_id', 'jumlah_sistem', 'jumlah_hitung', 'dihitung_pada', 'dihitung_oleh'],
    sql: `select id::text as id, count_id::text as opname_id, product_id::text as produk_id,
                 trim_scale(system_quantity)::text as jumlah_sistem, trim_scale(counted_quantity)::text as jumlah_hitung,
                 ${TIMESTAMP('counted_at')} as dihitung_pada, counted_by::text as dihitung_oleh
            from stock_count_items where workspace_id = $1 order by id`,
  },
  {
    file: 'supplier.csv',
    headers: ['id', 'nama', 'kontak', 'telepon', 'email', 'alamat', 'termin_hari', 'catatan', 'diarsipkan'],
    sql: `select id::text as id, name as nama, contact_name as kontak, phone as telepon, email as email,
                 address as alamat, payment_term_days::text as termin_hari, note as catatan,
                 is_archived::text as diarsipkan
            from suppliers where workspace_id = $1 order by id`,
  },
  {
    file: 'pesanan-pembelian.csv',
    headers: ['id', 'nomor', 'supplier_id', 'lokasi_id', 'status', 'tanggal_pesan', 'perkiraan_tiba', 'total', 'sudah_diterima', 'catatan', 'alasan_tolak', 'alasan_batal', 'dibuat_oleh', 'dibuat_pada', 'disetujui_pada'],
    sql: `select id::text as id, number as nomor, supplier_id::text as supplier_id, location_id::text as lokasi_id,
                 status as status, to_char(ordered_on, 'YYYY-MM-DD') as tanggal_pesan,
                 to_char(expected_on, 'YYYY-MM-DD') as perkiraan_tiba, total_amount::text as total,
                 trim_scale(received_total)::text as sudah_diterima, note as catatan,
                 rejected_reason as alasan_tolak, cancelled_reason as alasan_batal, created_by::text as dibuat_oleh,
                 ${TIMESTAMP('created_at')} as dibuat_pada, ${TIMESTAMP('approved_at')} as disetujui_pada
            from purchase_orders where workspace_id = $1 order by id`,
  },
  {
    file: 'pesanan-pembelian-baris.csv',
    headers: ['id', 'pesanan_id', 'produk_id', 'jumlah', 'harga_satuan', 'diskon', 'total_baris', 'jumlah_diterima', 'catatan'],
    sql: `select id::text as id, purchase_order_id::text as pesanan_id, product_id::text as produk_id,
                 trim_scale(quantity)::text as jumlah, unit_price::text as harga_satuan,
                 discount_amount::text as diskon, line_total::text as total_baris,
                 trim_scale(received_quantity)::text as jumlah_diterima, note as catatan
            from purchase_order_items where workspace_id = $1 order by id`,
  },
  {
    file: 'pesanan-pembelian-revisi.csv',
    headers: ['id', 'pesanan_id', 'revisi_ke', 'alasan', 'diubah_oleh', 'dibuat', 'isi_sebelumnya'],
    sql: `select id::text as id, purchase_order_id::text as pesanan_id, revision_number::text as revisi_ke,
                 reason as alasan, changed_by::text as diubah_oleh, ${TIMESTAMP('created_at')} as dibuat,
                 snapshot::text as isi_sebelumnya
            from purchase_order_revisions where workspace_id = $1 order by id`,
  },
  {
    file: 'penerimaan.csv',
    headers: ['id', 'nomor', 'pesanan_id', 'supplier_id', 'lokasi_id', 'tanggal_terima', 'diterima_oleh', 'catatan'],
    sql: `select id::text as id, number as nomor, purchase_order_id::text as pesanan_id,
                 supplier_id::text as supplier_id, location_id::text as lokasi_id,
                 to_char(received_on, 'YYYY-MM-DD') as tanggal_terima, received_by::text as diterima_oleh,
                 note as catatan
            from goods_receipts where workspace_id = $1 order by id`,
  },
  {
    file: 'penerimaan-baris.csv',
    headers: ['id', 'penerimaan_id', 'produk_id', 'jumlah', 'harga_satuan', 'harga_pokok', 'kedaluwarsa'],
    sql: `select id::text as id, goods_receipt_id::text as penerimaan_id, product_id::text as produk_id,
                 trim_scale(quantity)::text as jumlah, unit_price::text as harga_satuan,
                 unit_cost::text as harga_pokok, to_char(expires_at, 'YYYY-MM-DD') as kedaluwarsa
            from goods_receipt_items where workspace_id = $1 order by id`,
  },
  {
    file: 'retur-pembelian.csv',
    headers: ['id', 'nomor', 'pesanan_id', 'supplier_id', 'lokasi_id', 'tanggal_retur', 'dibuat_oleh', 'catatan'],
    sql: `select id::text as id, number as nomor, purchase_order_id::text as pesanan_id,
                 supplier_id::text as supplier_id, location_id::text as lokasi_id,
                 to_char(returned_on, 'YYYY-MM-DD') as tanggal_retur, created_by::text as dibuat_oleh,
                 note as catatan
            from purchase_returns where workspace_id = $1 order by id`,
  },
  {
    file: 'retur-pembelian-baris.csv',
    headers: ['id', 'retur_id', 'produk_id', 'jumlah', 'harga_satuan'],
    sql: `select id::text as id, purchase_return_id::text as retur_id, product_id::text as produk_id,
                 trim_scale(quantity)::text as jumlah, unit_price::text as harga_satuan
            from purchase_return_items where workspace_id = $1 order by id`,
  },
  {
    file: 'pembayaran-supplier.csv',
    headers: ['id', 'nomor', 'supplier_id', 'pesanan_id', 'tanggal_bayar', 'jumlah', 'metode', 'referensi', 'catatan', 'dibuat_oleh'],
    sql: `select id::text as id, number as nomor, supplier_id::text as supplier_id, purchase_order_id::text as pesanan_id,
                 to_char(paid_on, 'YYYY-MM-DD') as tanggal_bayar, amount::text as jumlah, method as metode,
                 reference as referensi, note as catatan, created_by::text as dibuat_oleh
            from supplier_payments where workspace_id = $1 order by id`,
  },
  {
    file: 'alokasi-pembayaran-supplier.csv',
    headers: ['id', 'pembayaran_id', 'pesanan_id', 'jumlah'],
    sql: `select id::text as id, supplier_payment_id::text as pembayaran_id, purchase_order_id::text as pesanan_id,
                 amount::text as jumlah
            from supplier_payment_allocations where workspace_id = $1 order by id`,
  },
  {
    file: 'utang-supplier.csv',
    headers: ['id', 'supplier_id', 'pesanan_id', 'penerimaan_id', 'retur_id', 'jumlah', 'tanggal', 'catatan'],
    sql: `select id::text as id, supplier_id::text as supplier_id, purchase_order_id::text as pesanan_id,
                 goods_receipt_id::text as penerimaan_id, purchase_return_id::text as retur_id,
                 amount::text as jumlah, to_char(entry_date, 'YYYY-MM-DD') as tanggal, note as catatan
            from supplier_debt_entries where workspace_id = $1 order by id`,
  },
  {
    file: 'pelanggan.csv',
    headers: ['id', 'nama', 'telepon', 'catatan', 'diarsipkan'],
    sql: `select id::text as id, name as nama, phone as telepon, note as catatan, is_archived::text as diarsipkan
            from customers where workspace_id = $1 order by id`,
  },
  {
    file: 'metode-pembayaran.csv',
    headers: ['id', 'nama', 'diarsipkan'],
    sql: `select id::text as id, name as nama, is_archived::text as diarsipkan
            from payment_methods where workspace_id = $1 order by id`,
  },
  {
    file: 'penjualan.csv',
    headers: ['id', 'nomor', 'tanggal', 'lokasi_id', 'pelanggan_id', 'metode_pembayaran', 'subtotal', 'diskon', 'total', 'harga_pokok', 'status', 'dibatalkan_pada', 'alasan_batal', 'catatan', 'dibuat_oleh', 'dibuat_pada'],
    sql: `select id::text as id, number as nomor, to_char(sold_on, 'YYYY-MM-DD') as tanggal,
                 location_id::text as lokasi_id, customer_id::text as pelanggan_id,
                 payment_method_label as metode_pembayaran, subtotal::text as subtotal,
                 discount_total::text as diskon, total_amount::text as total, cost_total::text as harga_pokok,
                 status as status, ${TIMESTAMP('cancelled_at')} as dibatalkan_pada, cancel_reason as alasan_batal,
                 note as catatan, created_by::text as dibuat_oleh, ${TIMESTAMP('created_at')} as dibuat_pada
            from sales where workspace_id = $1 order by id`,
  },
  {
    file: 'penjualan-baris.csv',
    headers: ['id', 'penjualan_id', 'produk_id', 'jumlah', 'harga_satuan', 'diskon', 'total_baris', 'harga_pokok_satuan', 'total_harga_pokok', 'catatan'],
    sql: `select id::text as id, sale_id::text as penjualan_id, product_id::text as produk_id,
                 trim_scale(quantity)::text as jumlah, unit_price::text as harga_satuan,
                 discount_amount::text as diskon, line_total::text as total_baris,
                 trim_scale(unit_cost_snapshot)::text as harga_pokok_satuan, cost_total::text as total_harga_pokok,
                 note as catatan
            from sale_items where workspace_id = $1 order by id`,
  },
  {
    file: 'pengeluaran.csv',
    headers: ['id', 'tanggal', 'kategori_id', 'deskripsi', 'jumlah', 'referensi', 'pesanan_id', 'dibuat_oleh'],
    sql: `select id::text as id, to_char(spent_on, 'YYYY-MM-DD') as tanggal, category_id::text as kategori_id,
                 description as deskripsi, amount::text as jumlah, reference as referensi,
                 purchase_order_id::text as pesanan_id, created_by::text as dibuat_oleh
            from expenses where workspace_id = $1 order by id`,
  },
  {
    file: 'kategori-pengeluaran.csv',
    headers: ['id', 'nama', 'diarsipkan'],
    sql: `select id::text as id, name as nama, is_archived::text as diarsipkan
            from expense_categories where workspace_id = $1 order by id`,
  },
]

const SIGNED_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/

/**
 * Nilai sel selalu dikutip, tanda kutip ganda digandakan. Nilai yang bisa
 * dijalankan spreadsheet sebagai rumus diberi awalan kutip tunggal; angka
 * negatif tetap angka, jadi tanda minusnya tidak ikut diawali kutip.
 */
function csvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const trimmed = text.trim()
  const looksLikeFormula = /^[=+\-@\t\r]/.test(trimmed) && !SIGNED_NUMBER.test(trimmed)
  const safe = looksLikeFormula && trimmed !== '' ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

function csvOf(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map((header) => csvValue(header)).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvValue(row[header])).join(','))
  }
  // BOM supaya Excel membaca huruf beraksen dengan benar.
  return `\uFEFF${lines.join('\r\n')}`
}

function guideOf(workspaceName: string, createdAt: Date): string {
  return [
    `Ekspor data workspace: ${workspaceName}`,
    `Dibuat: ${createdAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    '',
    'Arsip ini berisi CSV, satu berkas untuk satu tabel. Semua berkas memakai',
    'pengodean UTF-8 dan pemisah koma.',
    '',
    'Tanggal ditulis YYYY-MM-DD dan waktu dalam UTC. Kolom id dipertahankan',
    'supaya hubungan antar berkas bisa ditelusuri, misalnya produk_id di',
    'pergerakan-stok.csv menunjuk ke id di produk.csv.',
    '',
    'Sel yang dimulai dengan tanda rumus sudah diberi awalan kutip tunggal supaya',
    'tidak dijalankan sebagai rumus saat berkas dibuka di spreadsheet.',
    '',
    'Yang tidak ikut diekspor: berkas lampiran foto atau PDF pengeluaran, riwayat',
    'impor, log audit, dan data teknis seperti sesi, kata sandi, serta token.',
    '',
  ].join('\r\n')
}

export interface WorkspaceExport {
  fileName: string
  entries: ZipEntry[]
}

export async function buildWorkspaceExport(
  db: Database,
  workspaceId: number,
): Promise<WorkspaceExport> {
  const profile = await db.query<{ name: string; slug: string }>(
    'select name, slug from workspaces where id = $1',
    [workspaceId],
  )
  const workspace = profile.rows[0]
  if (!workspace) {
    throw new Error('Workspace tidak ditemukan.')
  }

  const entries: ZipEntry[] = []
  for (const dataset of datasets) {
    const result = await db.query<Record<string, unknown>>(dataset.sql, [workspaceId])
    entries.push({ name: dataset.file, data: csvOf(dataset.headers, result.rows) })
  }

  const createdAt = new Date()
  entries.push({ name: 'PANDUAN.txt', data: guideOf(workspace.name, createdAt) })

  return {
    fileName: `sahabat-umkm-${workspace.slug}-${createdAt.toISOString().slice(0, 10)}.zip`,
    entries,
  }
}
