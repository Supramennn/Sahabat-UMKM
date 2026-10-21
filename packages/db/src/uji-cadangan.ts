import type { Database } from './client.ts'

/**
 * Data contoh untuk uji cadangan dan pemulihan, dipakai oleh tes di
 * packages/db/test-postgres/cadangan-restore.test.ts dan oleh
 * scripts/cadangkan.mts.
 *
 * Padat tetapi sengaja menyentuh jenis kolom yang paling mudah salah dibaca
 * oleh cadangan logis: numeric dengan NaN, timestamptz mikrodetik, bytea,
 * jsonb berisi tanda kutip, `;`, dan baris baru, inet IPv6, uuid, serta date.
 * `cadangan_probe` adalah tabel uji murni untuk itu; baris lain berbentuk
 * alur bisnis nyata supaya urutan pemulihan lewat FK komposit teruji.
 */
export async function siapkanDataUjiCadangan(db: Database): Promise<void> {
  await db.exec(`
    drop table if exists cadangan_probe
  `)

  await db.exec(`
    create table cadangan_probe (
      id integer primary key,
      angka numeric,
      waktu timestamptz,
      tanggal date,
      berkas jsonb,
      ip inet,
      uid uuid,
      mentah bytea,
      teks text,
      benar boolean
    )
  `)

  await db.exec(`
    insert into cadangan_probe values (
      1,
      'NaN',
      '2026-10-21T05:04:59.123456+07:00'::timestamptz,
      '2026-02-28',
      '{"b": [1, 2, 3], "a": {"c": true}, "s": "tanda ''s; -- aman"}'::jsonb,
      'fe80::1',
      gen_random_uuid(),
      '\\x00fa01'::bytea,
      'baris pertama
      baris''s kedua; -- selesai',
      false
    )
  `)

  const pemilik = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ('pemilik@kedaicontoh.test', 'hash', 'Pemilik Kedai Contoh', now())
     returning id`,
  )
  const idPemilik = pemilik.rows[0]!.id

  const workspace = await db.query<{ id: number }>(
    `insert into workspaces (slug, name, business_type, owner_id)
     values ('kedai-uji-cadangan', 'Kedai Uji Cadangan', 'fnb', $1)
     returning id`,
    [idPemilik],
  )
  const idWorkspace = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [idWorkspace])
  await db.query(
    'insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)',
    [idWorkspace, idPemilik, 'owner'],
  )

  await db.query('insert into locations (workspace_id, name, code) values ($1, $2, $3)', [
    idWorkspace,
    'Gudang',
    'GDG',
  ])
  await db.query('insert into locations (workspace_id, name, code) values ($1, $2, $3)', [
    idWorkspace,
    'Kasir',
    'KSR',
  ])

  const kategori = await db.query<{ id: number }>(
    'insert into categories (workspace_id, name) values ($1, $2) returning id',
    [idWorkspace, 'Minuman'],
  )
  const idKategori = kategori.rows[0]!.id

  await db.query(
    `insert into products (workspace_id, sku, name, unit_code, reference_purchase_price, selling_price, min_stock, category_id)
     values ($1, 'KPI-001', 'Kopi Arabika', 'pack', 75000, 18000, '2.5000', $2)`,
    [idWorkspace, idKategori],
  )
  await db.query(
    `insert into products (workspace_id, sku, name, unit_code)
     values ($1, 'KPI-002', 'Teh Celup', 'box')`,
    [idWorkspace],
  )

  await db.query(
    `insert into product_costs (workspace_id, product_id, average_cost, inventory_value)
     select $1, p.id, 12000.5000, 360015
     from products p
     where p.workspace_id = $1 and p.sku = 'KPI-001'`,
    [idWorkspace],
  )

  await db.query(
    `insert into stock_movements
       (workspace_id, product_id, location_id, kind, direction, quantity, unit_cost,
        balance_before, balance_after, reason_code, occurred_on, actor_user_id, note, idempotency_key)
     select $1, p.id, l.id, 'masuk', 'tambah', 10.0000, 75000, 0.0000, 10.0000,
            'penerimaan', '2026-10-01', $2, 'Penerimaan awal', 'kunci-uji-cadangan-01'
     from products p, locations l
     where p.workspace_id = $1 and p.sku = 'KPI-001' and l.workspace_id = $1 and l.code = 'GDG'
     returning id`,
    [idWorkspace, idPemilik],
  )

  // Satu pembayaran supaya sekuens mandiri payment_numbers punya nilai
  // terakhir yang tidak nol untuk dibawa ulang saat pemulihan.
  await db.query(
    `insert into payments
       (workspace_id, plan_code, billing_period, amount, provider_order_id, expires_at, created_by)
     values ($1, 'usaha', 'bulanan', 89000, 'uji-cadangan-order-01', now() + interval '1 day', $2)`,
    [idWorkspace, idPemilik],
  )
}
