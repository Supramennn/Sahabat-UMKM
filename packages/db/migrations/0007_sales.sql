-- 0007_sales.sql
-- PRD 6.4 (penjualan sederhana dan pelanggan opsional), PRD 7 (laba kotor memakai
-- harga pokok rata-rata bergerak pada saat penjualan), A-07 (harga pokok disimpan
-- sebagai snapshot), B-07 (metode pembayaran diatur Owner), K-06 B-04 (impor
-- penjualan tercatat supaya bisa dibatalkan selama belum ada transaksi turunan).
--
-- Konvensi yang sama dengan migrasi sebelumnya:
--
-- 1. Setiap tabel terikat workspace punya batasan unik (id, workspace_id), dan
--    tabel turunan mereferensikan pasangan itu.
--
-- 2. Penjualan yang sudah dibuat tidak bisa diubah, hanya dibatalkan. Pembatalan
--    membuat baris ledger baru, tidak menghapus apa pun (PRD 6.4).

-- Nomor dokumen penjualan -------------------------------------------------------
-- KEPUTUSAN-TEKNIS bagian 3 menetapkan format INV-{tahun}-{urutan}.

alter table document_sequences drop constraint document_sequences_kind;
alter table document_sequences add constraint document_sequences_kind check (
  kind in ('po', 'penerimaan', 'retur', 'pembayaran', 'penjualan')
);

-- Metode pembayaran ---------------------------------------------------------------
-- B-07: metode pembayaran diatur Owner di Pengaturan, bukan daftar yang ditulis di
-- kode, supaya nama yang dipakai memang nama yang dipakai kasir (Tunai, QRIS,
-- Transfer, Tempo). Teks tetap boleh bebas saat mencatat penjualan, karena
-- penjualan di kasir sering terjadi sebelum Owner sempat mengatur daftarnya.

create table payment_methods (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_name_not_blank check (length(btrim(name)) > 0),
  constraint payment_methods_id_workspace_key unique (id, workspace_id)
);

create unique index payment_methods_workspace_name on payment_methods (workspace_id, lower(name))
  where not is_archived;

create trigger payment_methods_set_updated_at before update on payment_methods
  for each row execute function set_updated_at();

-- Pelanggan ------------------------------------------------------------------------
-- PRD 6.4 menyebut pelanggan opsional, jadi tabel ini hanya menyimpan nama, telepon,
-- dan catatan. Alamat dan email tidak ada karena tidak dipakai alur penjualan 1.0.

create table customers (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  phone text,
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

-- Penjualan --------------------------------------------------------------------------

create table sales (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  number text not null,
  -- Tanggal kalender menurut zona waktu workspace (B-10), sama seperti ledger stok.
  sold_on date not null,
  location_id bigint not null,
  customer_id bigint,
  payment_method_id bigint,
  -- Nama metode disalin ke penjualan. Metode di Pengaturan bisa diarsipkan atau
  -- diganti namanya setelah penjualan terjadi, dan nota lama harus tetap menyebut
  -- nama yang dipakai kasir pada saat itu.
  payment_method_label text not null,
  subtotal bigint not null,
  discount_total bigint not null default 0,
  total_amount bigint not null,
  -- Harga pokok dijumlahkan per baris dan disimpan di sini, jadi laba kotor penjualan
  -- ini tidak berubah walaupun rata-rata bergerak produk berubah di bulan berikutnya
  -- (A-07).
  cost_total bigint not null default 0,
  status text not null default 'selesai',
  cancelled_at timestamptz,
  cancelled_by bigint references users (id) on delete set null,
  cancel_reason text,
  note text,
  idempotency_key text,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint sales_status check (status in ('selesai', 'dibatalkan')),
  constraint sales_totals_not_negative check (
    subtotal >= 0 and discount_total >= 0 and total_amount >= 0 and cost_total >= 0
  ),
  constraint sales_discount_within_subtotal check (discount_total <= subtotal),
  constraint sales_total_matches_subtotal check (total_amount = subtotal - discount_total),
  constraint sales_cancel_needs_actor check (
    status <> 'dibatalkan' or (cancelled_at is not null and cancelled_by is not null)
  ),
  constraint sales_number_not_blank check (length(btrim(number)) > 0),
  constraint sales_payment_method_label_not_blank check (length(btrim(payment_method_label)) > 0),
  constraint sales_id_workspace_key unique (id, workspace_id),
  constraint sales_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id),
  constraint sales_customer_same_workspace foreign key (customer_id, workspace_id)
    references customers (id, workspace_id),
  constraint sales_payment_method_same_workspace foreign key (payment_method_id, workspace_id)
    references payment_methods (id, workspace_id)
);

create unique index sales_workspace_number on sales (workspace_id, number);
create unique index sales_idempotency on sales (workspace_id, idempotency_key)
  where idempotency_key is not null;
create index sales_workspace_time on sales (workspace_id, sold_on desc, id desc);
create index sales_location_time on sales (location_id, sold_on desc, id desc);
create index sales_customer_time on sales (customer_id, sold_on desc, id desc);

-- Trigger di bawah menjaga penjualan tetap seperti pada saat dibuat. Yang boleh berubah
-- hanya status dan kolom pembatalan. Tanpa ini, koreksi harga jual atau tanggal penjualan
-- bisa mengubah laporan periode yang sudah ditutup tanpa jejak.
create or replace function protect_sale_row() returns trigger as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.number is distinct from old.number
     or new.sold_on is distinct from old.sold_on
     or new.location_id is distinct from old.location_id
     or new.customer_id is distinct from old.customer_id
     or new.payment_method_id is distinct from old.payment_method_id
     or new.payment_method_label is distinct from old.payment_method_label
     or new.subtotal is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.total_amount is distinct from old.total_amount
     or new.cost_total is distinct from old.cost_total
     or new.note is distinct from old.note
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'penjualan yang sudah dibuat tidak dapat diubah, hanya dibatalkan'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sales_protect_row before update on sales
  for each row execute function protect_sale_row();

create trigger sales_no_delete before delete on sales
  for each row execute function reject_row_mutation();

create table sale_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  sale_id bigint not null,
  product_id bigint not null,
  quantity numeric(18, 4) not null,
  unit_price bigint not null,
  discount_amount bigint not null default 0,
  line_total bigint not null,
  -- A-07: harga pokok per satuan pada saat penjualan dibuat. Nilai ini tidak dihitung
  -- ulang dari rata-rata bergerak yang sekarang, supaya laba kotor bulan lalu tidak
  -- berubah karena ada penerimaan baru bulan ini. Pembatalan memakai nilai ini juga.
  unit_cost_snapshot numeric(18, 4) not null default 0,
  cost_total bigint not null default 0,
  note text,
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_unit_price_not_negative check (unit_price >= 0),
  constraint sale_items_discount_within_line check (
    discount_amount >= 0 and discount_amount <= unit_price * quantity
  ),
  constraint sale_items_cost_not_negative check (unit_cost_snapshot >= 0 and cost_total >= 0),
  constraint sale_items_id_workspace_key unique (id, workspace_id),
  constraint sale_items_sale_same_workspace foreign key (sale_id, workspace_id)
    references sales (id, workspace_id),
  constraint sale_items_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id)
);

create index sale_items_sale on sale_items (sale_id, id);
create index sale_items_product on sale_items (product_id, id);

create trigger sale_items_no_mutation before update or delete on sale_items
  for each row execute function reject_row_mutation();

-- Tautan penjualan ke ledger stok ---------------------------------------------------
-- Pembatalan mengembalikan stok memakai baris baru (PRD 6.4), jadi baris lama tidak
-- dihapus dan aplikasi perlu tahu baris mana yang milik penjualan tertentu.

create table sale_stock_movements (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  sale_id bigint not null,
  stock_movement_id bigint not null,
  role text not null default 'penjualan',
  created_at timestamptz not null default now(),
  constraint sale_stock_movements_role check (role in ('penjualan', 'pembatalan')),
  constraint sale_stock_movements_unique unique (sale_id, stock_movement_id, role),
  constraint sale_stock_movements_id_workspace_key unique (id, workspace_id),
  constraint sale_stock_movements_sale_same_workspace foreign key (sale_id, workspace_id)
    references sales (id, workspace_id),
  constraint sale_stock_movements_movement_same_workspace
    foreign key (stock_movement_id, workspace_id) references stock_movements (id, workspace_id)
);

create index sale_stock_movements_sale on sale_stock_movements (sale_id);
create index sale_stock_movements_movement on sale_stock_movements (stock_movement_id);

-- Baris hasil impor penjualan -----------------------------------------------------------
-- B-04: pembatalan impor hanya boleh selama belum ada transaksi turunan. Impor penjualan
-- menghasilkan penjualan dan baris ledger, jadi barisnya dicatat di sini supaya
-- pembatalan tidak perlu menebak dari nomor.

create table import_job_sales (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  import_job_id bigint not null,
  sale_id bigint not null,
  created_at timestamptz not null default now(),
  constraint import_job_sales_job_same_workspace foreign key (import_job_id, workspace_id)
    references import_jobs (id, workspace_id),
  constraint import_job_sales_sale_same_workspace foreign key (sale_id, workspace_id)
    references sales (id, workspace_id),
  constraint import_job_sales_unique unique (import_job_id, sale_id)
);

create index import_job_sales_sale on import_job_sales (sale_id);