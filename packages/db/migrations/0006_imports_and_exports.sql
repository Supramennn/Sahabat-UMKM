-- 0006_imports_and_exports.sql
-- PRD 6.8: impor produk, supplier, saldo awal, dan penjualan dari CSV atau XLSX,
-- hasilnya bisa dibatalkan dalam 24 jam bila belum ada transaksi turunan, dan
-- seluruh data workspace bisa diekspor ke CSV oleh Owner kapan saja.
--
-- B-04 sudah memutuskan batas pembatalannya: pembatalan hanya boleh kalau belum
-- ada transaksi turunan yang menyentuh baris hasil impor. Impor data master
-- (produk, supplier) tidak menghasilkan transaksi sendiri, jadi bisa dibatalkan
-- selama barisnya belum dipakai. Impor saldo awal menghasilkan baris ledger
-- stok, jadi membatalkannya berarti membuat baris pembalik, bukan menghapus
-- ledger.

create table import_jobs (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  kind text not null,
  -- Nama berkas asli hanya untuk ditampilkan. Isinya tidak pernah disimpan, jadi
  -- tidak ada data bisnis yang tersimpan di luar kolom yang memang perlu.
  file_name text,
  -- Hash isi berkas supaya berkas yang sama bisa dikenali tanpa menyimpan isinya.
  content_hash text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  cancelled_at timestamptz,
  cancelled_by bigint references users (id),
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint import_jobs_kind check (
    kind in ('produk', 'supplier', 'saldo_awal', 'penjualan')
  ),
  constraint import_jobs_counts_not_negative check (
    total_rows >= 0 and imported_rows >= 0 and skipped_rows >= 0
  ),
  constraint import_jobs_cancel_needs_actor check (
    cancelled_at is null or cancelled_by is not null
  ),
  constraint import_jobs_id_workspace_key unique (id, workspace_id)
);

create index import_jobs_workspace_created on import_jobs (workspace_id, created_at desc);
create unique index import_jobs_live_hash on import_jobs (workspace_id, kind, content_hash)
  where cancelled_at is null;

-- Baris hasil impor untuk data master. Tabel ini yang membuat pembatalan bisa
-- tahu baris mana milik impor mana tanpa menebak dari nama.
create table import_job_products (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  import_job_id bigint not null,
  product_id bigint not null,
  created_at timestamptz not null default now(),
  constraint import_job_products_job_same_workspace foreign key (import_job_id, workspace_id)
    references import_jobs (id, workspace_id),
  constraint import_job_products_product_same_workspace foreign key (product_id, workspace_id)
    references products (id, workspace_id),
  constraint import_job_products_unique unique (import_job_id, product_id)
);

create index import_job_products_product on import_job_products (product_id);

create table import_job_suppliers (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  import_job_id bigint not null,
  supplier_id bigint not null,
  created_at timestamptz not null default now(),
  constraint import_job_suppliers_job_same_workspace foreign key (import_job_id, workspace_id)
    references import_jobs (id, workspace_id),
  constraint import_job_suppliers_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id),
  constraint import_job_suppliers_unique unique (import_job_id, supplier_id)
);

create index import_job_suppliers_supplier on import_job_suppliers (supplier_id);

-- Impor saldo awal menghasilkan baris ledger. Barisnya dicatat di sini supaya
-- pembatalan bisa membuat baris pembalik yang tepat, bukan menghapus ledger.
create table import_job_stock_movements (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  import_job_id bigint not null,
  stock_movement_id bigint not null,
  created_at timestamptz not null default now(),
  constraint import_job_stock_movements_job_same_workspace foreign key (import_job_id, workspace_id)
    references import_jobs (id, workspace_id),
  constraint import_job_stock_movements_movement_same_workspace
    foreign key (stock_movement_id, workspace_id) references stock_movements (id, workspace_id),
  constraint import_job_stock_movements_unique unique (import_job_id, stock_movement_id)
);

create index import_job_stock_movements_movement on import_job_stock_movements (stock_movement_id);