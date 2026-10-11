-- 0006_sales.sql
-- PRD 6.4 (penjualan sederhana), PRD 6.5 (pengeluaran operasional), PRD 6.6 (laporan penjualan & laba kotor).
--
-- Konvensi yang sama: foreign key komposit (id, workspace_id), tabel terikat workspace
-- punya batasan unik (id, workspace_id), relasi lintas workspace mustahil di level database.

-- Pelanggan -------------------------------------------------------------------
-- PRD 6.4: pelanggan opsional pada penjualan. Hanya nama wajib, kontak bebas.

create table customers (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  note text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_name_not_blank check (length(btrim(name)) > 0),
  constraint customers_id_workspace_key unique (id, workspace_id)
);

create unique index customers_workspace_name on customers (workspace_id, lower(name))
  where not is_archived;

create trigger customers_set_updated_at before update on customers
  for each row execute function set_updated_at();

create trigger customers_no_mutation before delete on customers
  for each row execute function reject_row_mutation();

-- Metode pembayaran -----------------------------------------------------------
-- PRD 6.4: teks bebas dari daftar yang diatur Owner. Disimpan per workspace.

create table payment_methods (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_name_not_blank check (length(btrim(name)) > 0),
  constraint payment_methods_id_workspace_key unique (id, workspace_id)
);

create unique index payment_methods_workspace_name on payment_methods (workspace_id, lower(name))
  where is_active;

create trigger payment_methods_set_updated_at before update on payment_methods
  for each row execute function set_updated_at();

-- Insert metode bawaan supaya workspace baru langsung bisa mencatat penjualan.
insert into payment_methods (workspace_id, name, sort_order)
select w.id, m.name, m.sort_order
from workspaces w
cross join (values
  ('Tunai', 1),
  ('Transfer', 2),
  ('Kartu', 3),
  ('QRIS', 4),
  ('E-Wallet', 5)
) as m(name, sort_order)
on conflict do nothing;

-- Penjualan -------------------------------------------------------------------
-- PRD 6.4: catat penjualan dengan tanggal, lokasi, item, jumlah, harga jual,
-- diskon, metode pembayaran, pelanggan opsional. Nomor INV-{tahun}-{urutan}.
-- Laba kotor pakai harga_pokok_snapshot (rata-rata bergerak saat transaksi).

create table sales (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  customer_id bigint,
  location_id bigint not null,
  number text not null,
  sold_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  payment_method text not null,
  note text,
  total_amount bigint not null default 0,
  total_cogs bigint not null default 0,
  gross_profit bigint not null default 0,
  is_cancelled boolean not null default false,
  cancelled_reason text,
  cancelled_at timestamptz,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_payment_method_not_blank check (length(btrim(payment_method)) > 0),
  constraint sales_total_not_negative check (total_amount >= 0),
  constraint sales_id_workspace_key unique (id, workspace_id),
  constraint sales_customer_same_workspace foreign key (customer_id, workspace_id)
    references customers (id, workspace_id),
  constraint sales_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create unique index sales_workspace_number on sales (workspace_id, number);
create index sales_workspace_date on sales (workspace_id, sold_on desc, id desc);
create index sales_customer on sales (customer_id, sold_on desc);

create trigger sales_set_updated_at before update on sales
  for each row execute function set_updated_at();

-- Baris penjualan tidak boleh dihapus (PRD 6.4: pembatalan bikin transaksi pembalik).
create trigger sales_no_mutation before delete on sales
  for each row execute function reject_row_mutation();

create table sale_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  sale_id bigint not null,
  product_id bigint not null,
  quantity numeric(18, 4) not null,
  -- Harga jual per satuan dalam rupiah penuh.
  unit_price bigint not null,
  discount_amount bigint not null default 0,
  line_total bigint not null,
  -- Harga pokok rata-rata bergerak PADA SAAT TRANSAKSI. Disimpan supaya laba kotor
  -- historis tidak berubah walau rata-rata bergerak berubah kemudian (A-07).
  unit_cogs numeric(18, 4) not null,
  line_cogs bigint not null,
  line_gross_profit bigint not null,
  stock_movement_id bigint,
  note text,
  created_at timestamptz not null default now(),
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_price_not_negative check (unit_price >= 0),
  constraint sale_items_discount_not_negative check (discount_amount >= 0),
  constraint sale_items_cogs_not_negative check (unit_cogs >= 0),
  constraint sale_items_line_total_matches check (
    line_total = unit_price * quantity - discount_amount
  ),
  constraint sale_items_line_cogs_matches check (
    line_cogs = round(unit_cogs * quantity)
  ),
  constraint sale_items_line_gross_profit_matches check (
    line_gross_profit = line_total - line_cogs
  ),
  constraint sale_items_id_workspace_key unique (id, workspace_id),
  constraint sale_items_sale_same_workspace foreign key (sale_id, workspace_id)
    references sales (id, workspace_id),
  constraint sale_items_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id)
);

create index sale_items_sale on sale_items (sale_id);
create index sale_items_product on sale_items (product_id, workspace_id);

create trigger sale_items_no_mutation before update or delete on sale_items
  for each row execute function reject_row_mutation();

-- Snapshot rata-rata bergerak untuk pelaporan laba kotor historis.
-- A-07: simpan harga_pokok_snapshot di setiap baris penjualan.
create table product_cost_snapshots (
  workspace_id bigint not null references workspaces (id) on delete cascade,
  product_id bigint not null,
  -- Disimpan numeric(18,4) karena rata-rata bisa pecahan rupiah.
  average_cost numeric(18, 4) not null,
  updated_at timestamptz not null default now(),
  constraint product_cost_snapshots_key primary key (product_id, workspace_id),
  constraint product_cost_snapshots_cost_not_negative check (average_cost >= 0),
  constraint product_cost_snapshots_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id)
);

create trigger product_cost_snapshots_set_updated_at before update on product_cost_snapshots
  for each row execute function set_updated_at();

-- Pengeluaran operasional -----------------------------------------------------
-- PRD 6.5: tanggal, kategori, deskripsi, nominal, referensi, lampiran, pembuat.
-- Kategori diatur Owner/Admin. PO tidak dicatat ulang sebagai pengeluaran.

create table expense_categories (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint expense_categories_id_workspace_key unique (id, workspace_id)
);

create unique index expense_categories_workspace_name on expense_categories (workspace_id, lower(name))
  where is_active;

create trigger expense_categories_set_updated_at before update on expense_categories
  for each row execute function set_updated_at();

-- Insert kategori bawaan.
insert into expense_categories (workspace_id, name, sort_order)
select w.id, c.name, c.sort_order
from workspaces w
cross join (values
  ('Sewa', 1),
  ('Listrik & Air', 2),
  ('Gaji & Upah', 3),
  ('Transportasi', 4),
  ('Pemasaran', 5),
  ('Peralatan & Perlengkapan', 6),
  ('Perawatan & Perbaikan', 7),
  ('Asuransi', 8),
  ('Lainnya', 99)
) as c(name, sort_order)
on conflict do nothing;

create table expenses (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  category_id bigint not null,
  description text not null,
  amount bigint not null,
  spent_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  reference text,
  attachment_key text,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_description_not_blank check (length(btrim(description)) > 0),
  constraint expenses_id_workspace_key unique (id, workspace_id),
  constraint expenses_category_same_workspace foreign key (category_id, workspace_id)
    references expense_categories (id, workspace_id)
);

create index expenses_workspace_date on expenses (workspace_id, spent_on desc, id desc);
create index expenses_category on expenses (category_id, spent_on desc);

create trigger expenses_set_updated_at before update on expenses
  for each row execute function set_updated_at();

-- Lampiran pengeluaran (foto/PDF) --------------------------------------------
-- PRD 6.5: lampiran foto atau PDF pada pengeluaran.

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references workspaces (id) on delete cascade,
  expense_id bigint not null,
  object_key text not null,
  mime_type text not null,
  file_size bigint not null,
  original_name text not null,
  uploaded_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint attachments_file_size_positive check (file_size > 0),
  constraint attachments_expense_same_workspace foreign key (expense_id, workspace_id)
    references expenses (id, workspace_id)
);

create index attachments_expense on attachments (expense_id);

-- Urutan nomor dokumen penjualan ---------------------------------------------
-- Format INV-{tahun}-{urutan} sudah ada di document_sequences (kind='penjualan').
-- Tambahkan check constraint untuk kind penjualan.
-- Hapus constraint lama dulu kalau ada, lalu buat yang baru.
alter table document_sequences
  drop constraint if exists document_sequences_kind;

alter table document_sequences
  add constraint document_sequences_kind check (
    kind in ('po', 'penerimaan', 'retur', 'pembayaran', 'penjualan')
  );