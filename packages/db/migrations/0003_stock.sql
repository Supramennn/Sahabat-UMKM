-- 0003_stock.sql
-- PRD 6.2 (produk, lokasi, stok masuk dan keluar, penyesuaian, stok opname,
-- tanggal kedaluwarsa per penerimaan), PRD 7 (metode persediaan rata-rata
-- bergerak), PRD 13 (ledger yang tidak bisa diubah dan foreign key komposit).
--
-- Konvensi yang sama dengan migrasi sebelumnya:
--
-- 1. Setiap tabel terikat workspace punya batasan unik (id, workspace_id), dan
--    tabel turunan mereferensikan pasangan itu. Relasi lintas workspace mustahil
--    terjadi di level database (PRD 9).
--
-- 2. stock_movements adalah ledger. Barisnya tidak boleh diubah atau dihapus, dan
--    koreksi selalu dibuat sebagai baris baru (PRD 6.2, PRD 13).
--
-- 3. Saldo tidak dihitung ulang dari penjumlahan ledger setiap kali dibaca. Nilainya
--    disimpan di stock_balances, diperbarui di transaksi yang sama dengan baris
--    ledger, dan dikunci dengan select ... for update supaya dua pengguna tidak
--    bisa sama-sama menghabiskan stok terakhir (PRD 6.2).

-- Kategori ------------------------------------------------------------------

create table categories (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0),
  constraint categories_id_workspace_key unique (id, workspace_id)
);

create unique index categories_workspace_name on categories (workspace_id, lower(name));

-- Lokasi --------------------------------------------------------------------
-- Batas jumlah lokasi per paket belum bisa ditulis di sini: paket belum ada, dan
-- batas yang ditulis sebelum datanya ada hanya akan mengabadikan angka perkiraan.

create table locations (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  -- Kode pendek dipakai pada input cepat dari ponsel dan label cetak.
  code text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_not_blank check (length(btrim(name)) > 0),
  constraint locations_id_workspace_key unique (id, workspace_id)
);

create unique index locations_workspace_name on locations (workspace_id, lower(name))
  where not is_archived;

create trigger locations_set_updated_at before update on locations
  for each row execute function set_updated_at();

-- Lokasi bawaan per workspace, dipakai form Entri stok sebagai pilihan bawaan.
alter table workspaces add column default_location_id bigint;

-- Produk ---------------------------------------------------------------------
-- B-07: satuan dikelola di dalam form produk dari daftar sarat, jadi satuan tidak
-- menjadi tabel dan tidak bisa melebar ke nilai bebas yang tidak bisa dibaca laporan.
-- B-08: status produk adalah aktif, nonaktif, atau diarsipkan. Batas paket
-- "produk aktif" nanti hanya menghitung status aktif.

create table products (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  category_id bigint,
  -- SKU unik per workspace, bukan unik global: dua workspace boleh punya SKU sama.
  sku text not null,
  name text not null,
  unit_code text not null,
  -- Harga beli referensi dalam rupiah penuh. Angka ini tidak menggantikan harga
  -- sebenarnya pada PO dan tidak dipakai untuk laba kotor: harga pokok diambil dari
  -- rata-rata bergerak di product_costs.
  reference_purchase_price bigint,
  selling_price bigint,
  min_stock numeric(18, 4),
  status text not null default 'aktif',
  photo_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status check (status in ('aktif', 'nonaktif', 'diarsipkan')),
  constraint products_unit_known check (
    unit_code in (
      'pcs', 'bungkus', 'box', 'karung', 'lusin', 'rim', 'pack', 'sachet',
      'kg', 'gram', 'ons', 'liter', 'ml', 'galon', 'dozen', 'paket'
    )
  ),
  constraint products_prices_not_negative check (
    (reference_purchase_price is null or reference_purchase_price >= 0)
    and (selling_price is null or selling_price >= 0)
  ),
  constraint products_min_stock_not_negative check (min_stock is null or min_stock >= 0),
  constraint products_sku_not_blank check (length(btrim(sku)) > 0),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_id_workspace_key unique (id, workspace_id),
  -- Kategori harus milik workspace yang sama. Kalau rujukan ini hanya ke id, produk
  -- bisa menunjuk kategori milik workspace lain.
  constraint products_category_same_workspace foreign key (category_id, workspace_id)
    references categories (id, workspace_id)
);

create unique index products_workspace_sku on products (workspace_id, lower(sku));
create index products_workspace_status on products (workspace_id, status);
create index products_category on products (category_id);

create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

-- Rata-rata bergerak ---------------------------------------------------------
-- PRD 7 menetapkan rata-rata bergerak per produk per workspace. Nilai per satuan
-- bisa pecahan rupiah, jadi kolom ini numeric(18,4) dan dibulatkan ke rupiah penuh
-- per baris ketika nilai akhirnya disimpan.

create table product_costs (
  workspace_id bigint not null references workspaces (id) on delete cascade,
  product_id bigint not null,
  average_cost numeric(18, 4) not null default 0,
  -- Nilai persediaan berjalan memakai kolom ini, bukan penjumlahan ledger, supaya
  -- performanya tidak bergantung pada jumlah riwayat.
  inventory_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint product_costs_average_not_negative check (average_cost >= 0),
  constraint product_costs_inventory_not_negative check (inventory_value >= 0),
  constraint product_costs_key primary key (product_id, workspace_id),
  constraint product_costs_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id)
);

create trigger product_costs_set_updated_at before update on product_costs
  for each row execute function set_updated_at();

-- Saldo ----------------------------------------------------------------------

create table stock_balances (
  workspace_id bigint not null references workspaces (id) on delete cascade,
  product_id bigint not null,
  location_id bigint not null,
  quantity numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now(),
  -- PRD 6.2: stok negatif ditolak. Batasan ini membuat stok negatif mustahil
  -- ditulis, termasuk lewat kueri yang salah.
  constraint stock_balances_quantity_not_negative check (quantity >= 0),
  constraint stock_balances_key primary key (product_id, location_id, workspace_id),
  constraint stock_balances_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id),
  constraint stock_balances_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create trigger stock_balances_set_updated_at before update on stock_balances
  for each row execute function set_updated_at();

-- Lot dan tanggal kedaluwarsa ------------------------------------------------
-- PRD 6.2 menyimpan tanggal kedaluwarsa per penerimaan. A-05 menetapkan 1.0 tidak
-- mengalokasikan FEFO: barang keluar diambil dari lot terlama lebih dulu, dan
-- tanggal yang ditampilkan adalah yang paling awal dari lot yang masih bersaldo.

create table stock_lots (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  product_id bigint not null,
  location_id bigint not null,
  movement_id bigint not null,
  received_at timestamptz not null default now(),
  expires_at date,
  quantity_received numeric(18, 4) not null,
  quantity_remaining numeric(18, 4) not null,
  constraint stock_lots_remaining_not_negative check (quantity_remaining >= 0),
  constraint stock_lots_remaining_within_received check (quantity_remaining <= quantity_received),
  constraint stock_lots_received_positive check (quantity_received > 0),
  constraint stock_lots_id_workspace_key unique (id, workspace_id),
  constraint stock_lots_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id),
  constraint stock_lots_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create index stock_lots_fifo on stock_lots (product_id, location_id, received_at)
  where quantity_remaining > 0;
create index stock_lots_expiry on stock_lots (product_id, location_id, expires_at)
  where quantity_remaining > 0 and expires_at is not null;

-- Ledger ----------------------------------------------------------------------

create table stock_movements (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  product_id bigint not null,
  location_id bigint not null,
  kind text not null,
  -- Arahnya selalu tersimpan eksplisit. Jenis gerak tidak selalu cukup: selisih
  -- opname bisa naik atau turun, dan kueri penjumlahan saldo harus bisa membacanya
  -- tanpa menebak-nebak jenisnya.
  direction text not null,
  -- Selalu positif. Arahnya ada di kolom direction, supaya satu angka punya satu
  -- arti di seluruh kueri dan tidak pernah ada nilai negatif yang ambigu.
  quantity numeric(18, 4) not null,
  unit_cost bigint,
  -- Saldo sebelum dan sesudah baris ini. PRD 6.2 meminta keduanya tersimpan,
  -- supaya selisih bisa ditelusuri tanpa menghitung ulang seluruh riwayat.
  balance_before numeric(18, 4) not null,
  balance_after numeric(18, 4) not null,
  reason_code text not null,
  reference text,
  -- Tanggal kalender menurut zona waktu workspace (B-10), disimpan sebagai date
  -- supaya "hari" pada laporan sama dengan yang dilihat pengguna.
  occurred_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  actor_user_id bigint references users (id) on delete set null,
  note text,
  -- Input dari ponsel bisa terkirim dua kali, jadi klien boleh mengirim kuncinya.
  -- Kolom ini null untuk entri yang tidak memakai kunci.
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint stock_movements_kind check (
    kind in (
      'masuk', 'keluar', 'penyesuaian_naik', 'penyesuaian_turun',
      'opname_selisih', 'koreksi_harga'
    )
  ),
  constraint stock_movements_direction check (direction in ('tambah', 'kurang')),
  constraint stock_movements_quantity_positive check (quantity > 0),
  constraint stock_movements_unit_cost_not_negative check (unit_cost is null or unit_cost >= 0),
  constraint stock_movements_balance_not_negative check (balance_after >= 0),
  constraint stock_movements_reason_not_blank check (length(btrim(reason_code)) > 0),
  constraint stock_movements_id_workspace_key unique (id, workspace_id),
  constraint stock_movements_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id),
  constraint stock_movements_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create unique index stock_movements_idempotency on stock_movements (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index stock_movements_product_time on stock_movements (product_id, occurred_on desc, id desc);
create index stock_movements_location_time on stock_movements (location_id, occurred_on desc, id desc);
create index stock_movements_workspace_time on stock_movements (workspace_id, occurred_on desc, id desc);

-- Trigger di bawah adalah inti PRD 6.2 dan PRD 13. Riwayat stok tidak dapat diubah
-- atau dihapus diam-diam; koreksi selalu baris baru.
create trigger stock_movements_no_mutation before update or delete on stock_movements
  for each row execute function reject_row_mutation();

alter table stock_lots add constraint stock_lots_movement_same_workspace
  foreign key (movement_id, workspace_id) references stock_movements (id, workspace_id);

-- Lokasi bawaan ---------------------------------------------------------------

create or replace function set_default_location() returns trigger as $$
begin
  -- Lokasi pertama yang dibuat menjadi lokasi bawaan, supaya workspace baru tidak
  -- punya keadaan tanpa lokasi untuk input stok.
  if not exists (
    select 1 from workspaces where id = new.workspace_id and default_location_id is null
  ) then
    return new;
  end if;

  update workspaces set default_location_id = new.id where id = new.workspace_id;
  return new;
end;
$$ language plpgsql;

create trigger locations_set_default after insert on locations
  for each row execute function set_default_location();

-- Stok opname -----------------------------------------------------------------

create table stock_counts (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  location_id bigint not null,
  status text not null default 'draf',
  note text,
  started_by bigint not null references users (id),
  approved_by bigint references users (id),
  started_at timestamptz not null default now(),
  approved_at timestamptz,
  -- Sesi bisa dilanjutkan di hari berikutnya (PRD 6.2), jadi waktu tidak
  -- menentukan status.
  constraint stock_counts_status check (status in ('draf', 'selesai', 'disetujui')),
  constraint stock_counts_id_workspace_key unique (id, workspace_id),
  constraint stock_counts_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create index stock_counts_open on stock_counts (workspace_id, location_id)
  where status = 'draf';

create table stock_count_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  count_id bigint not null,
  product_id bigint not null,
  -- Saldo sistem ketika jumlah fisik dicatat. Disimpan supaya selisih yang
  -- ditampilkan berasal dari angka yang sama dengan yang dilihat petugas.
  system_quantity numeric(18, 4) not null,
  counted_quantity numeric(18, 4) not null default 0,
  counted_at timestamptz,
  counted_by bigint references users (id) on delete set null,
  constraint stock_count_items_count_not_negative check (counted_quantity >= 0),
  constraint stock_count_items_unique_product unique (count_id, product_id),
  constraint stock_count_items_id_workspace_key unique (id, workspace_id),
  constraint stock_count_items_count_same_workspace foreign key (count_id, workspace_id)
    references stock_counts (id, workspace_id),
  constraint stock_count_items_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id)
);

create index stock_count_items_count on stock_count_items (count_id);
