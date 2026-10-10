-- 0004_purchasing.sql
-- PRD 6.3 (supplier, PO, approval, penerimaan bertahap, retur, pembayaran
-- supplier), PRD 8 (peran dan approval), PRD 9 (idempotency dan audit), dan
-- KEPUTUSAN-TEKNIS bagian 3 (nomor dokumen per workspace per tahun).
--
-- Konvensi sama seperti migrasi sebelumnya: setiap tabel terikat workspace punya
-- batasan unik (id, workspace_id), tabel turunan mereferensikan pasangan itu,
-- dan tidak ada kueri yang boleh menyeberang workspace.

-- Supplier -------------------------------------------------------------------

create table suppliers (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  -- Termin pembayaran dalam hari, dipakai untuk menghitung jatuh tempo utang
  -- supplier. PRD 6.3 menyebutnya tanpa memberi angka, jadi ini milik supplier
  -- dan boleh kosong.
  payment_term_days integer,
  note text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_not_blank check (length(btrim(name)) > 0),
  constraint suppliers_email_lowercase check (email is null or email = lower(email)),
  constraint suppliers_term_not_negative check (
    payment_term_days is null or payment_term_days > 0
  ),
  constraint suppliers_id_workspace_key unique (id, workspace_id)
);

create unique index suppliers_workspace_name on suppliers (workspace_id, lower(name))
  where not is_archived;

create trigger suppliers_set_updated_at before update on suppliers
  for each row execute function set_updated_at();

create trigger suppliers_no_mutation before delete on suppliers
  for each row execute function reject_row_mutation();

-- Urutan nomor dokumen -------------------------------------------------------
-- PRD 6.3 minta nomor PO otomatis dan unik per workspace. Urutannya diambil dari
-- satu baris per jenis dokumen per tahun per workspace, bukan dari sequence global,
-- supaya dua workspace tidak saling mengambil nomor dan nomornya tetap urut per
-- workspace. Baris itu dikunci saat nomor diambil, supaya dua PO yang dibuat
-- bersamaan tidak mendapat nomor yang sama.

create table document_sequences (
  workspace_id bigint not null references workspaces (id) on delete cascade,
  kind text not null,
  year integer not null,
  last_number integer not null default 0,
  constraint document_sequences_key primary key (workspace_id, kind, year),
  constraint document_sequences_kind check (
    kind in ('po', 'penerimaan', 'retur', 'pembayaran')
  ),
  constraint document_sequences_year check (year between 2000 and 2100)
);

-- Purchase order -------------------------------------------------------------

create table purchase_orders (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  supplier_id bigint not null,
  location_id bigint not null,
  number text not null,
  status text not null default 'draft',
  ordered_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  expected_on date,
  note text,
  created_by bigint not null references users (id),
  submitted_at timestamptz,
  approved_by bigint references users (id),
  approved_at timestamptz,
  rejected_reason text,
  cancelled_reason text,
  closed_at timestamptz,
  -- Jumlah barang yang sudah diterima dan nilai yang sudah dibayar dihitung dari
  -- tabel anak, tapi disimpan di sini supaya daftar PO tidak perlu menggabungkan
  -- seluruh riwayat setiap kali dibuka.
  received_total numeric(18, 4) not null default 0,
  total_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_status check (
    status in (
      'draft', 'diajukan', 'disetujui', 'ditolak', 'dibatalkan',
      'diterima_sebagian', 'diterima', 'ditutup'
    )
  ),
  constraint purchase_orders_total_not_negative check (total_amount >= 0),
  constraint purchase_orders_id_workspace_key unique (id, workspace_id),
  constraint purchase_orders_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id),
  constraint purchase_orders_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id)
);

create unique index purchase_orders_workspace_number on purchase_orders (workspace_id, number);
create index purchase_orders_workspace_status on purchase_orders (workspace_id, status, ordered_on desc);
create index purchase_orders_supplier on purchase_orders (supplier_id, ordered_on desc);

create trigger purchase_orders_set_updated_at before update on purchase_orders
  for each row execute function set_updated_at();

-- PO yang sudah disetujui tidak boleh diubah diam-diam (PRD 6.3). Perubahan
-- harus lewat revisi bernomor dengan catatan alasan.
create or replace function guard_approved_purchase_order() returns trigger as $$
begin
  if old.status = 'disetujui'
     and (new.supplier_id, new.location_id, new.ordered_on)
       is distinct from (old.supplier_id, old.location_id, old.ordered_on) then
    raise exception 'PO yang sudah disetujui tidak bisa diubah. Buat revisi baru.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger purchase_orders_block_direct_edit before update on purchase_orders
  for each row execute function guard_approved_purchase_order();

create table purchase_order_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_order_id bigint not null,
  product_id bigint not null,
  quantity numeric(18, 4) not null,
  -- Harga per satuan dalam rupiah penuh. Diskon dan total dihitung ulang setiap
  -- kali item berubah, jadi nilai yang disimpan selalu bisa dipertanggungjawabkan.
  unit_price bigint not null,
  discount_amount bigint not null default 0,
  line_total bigint not null,
  received_quantity numeric(18, 4) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_items_quantity_positive check (quantity > 0),
  constraint purchase_order_items_received_not_negative check (received_quantity >= 0),
  constraint purchase_order_items_received_within_ordered check (received_quantity <= quantity),
  constraint purchase_order_items_price_not_negative check (unit_price >= 0),
  constraint purchase_order_items_discount_not_negative check (discount_amount >= 0),
  constraint purchase_order_items_total_matches check (
    line_total = unit_price * quantity - discount_amount
  ),
  constraint purchase_order_items_id_workspace_key unique (id, workspace_id),
  constraint purchase_order_items_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id),
  constraint purchase_order_items_product_same_workspace
    foreign key (product_id, workspace_id) references products (id, workspace_id)
);

create index purchase_order_items_order on purchase_order_items (purchase_order_id);
create unique index purchase_order_items_unique_product
  on purchase_order_items (purchase_order_id, product_id);

create trigger purchase_order_items_set_updated_at before update on purchase_order_items
  for each row execute function set_updated_at();

create table purchase_order_revisions (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_order_id bigint not null,
  revision_number integer not null,
  reason text not null,
  changed_by bigint not null references users (id),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint purchase_order_revisions_reason_not_blank check (length(btrim(reason)) > 0),
  constraint purchase_order_revisions_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

create unique index purchase_order_revisions_number
  on purchase_order_revisions (purchase_order_id, revision_number);

create trigger purchase_order_revisions_no_mutation before update or delete on purchase_order_revisions
  for each row execute function reject_row_mutation();

-- Penerimaan barang ------------------------------------------------------------
-- PRD 6.3: penerimaan bisa bertahap, dan permintaan yang dikirim dua kali tidak
-- menggandakan stok. Kunci idempotensi memakai tabel idempotency_keys yang sudah
-- ada, dan pada setiap penerimaan ada rujukan ke baris lot supaya barang keluar bisa ditelusuri
-- ke dokumen asalnya.

create table goods_receipts (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_order_id bigint,
  supplier_id bigint not null,
  location_id bigint not null,
  number text not null,
  received_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  note text,
  received_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint goods_receipts_id_workspace_key unique (id, workspace_id),
  constraint goods_receipts_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id),
  constraint goods_receipts_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id),
  constraint goods_receipts_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

create unique index goods_receipts_workspace_number on goods_receipts (workspace_id, number);
create index goods_receipts_order on goods_receipts (purchase_order_id, received_on desc);

create table goods_receipt_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  goods_receipt_id bigint not null,
  product_id bigint not null,
  quantity numeric(18, 4) not null,
  unit_price bigint not null,
  -- Harga yang dipakai untuk menghitung harga pokok. Untuk penerimaan dari PO ini
  -- harga PO; untuk barang yang datang tanpa PO, harga yang dicatat petugas.
  unit_cost bigint,
  expires_at date,
  -- Nomor baris ledger stok yang dibuat oleh penerimaan ini, supaya selisih lot
  -- bisa ditelusuri ke dokumen tanpa menebak.
  stock_movement_id bigint,
  created_at timestamptz not null default now(),
  constraint goods_receipt_items_quantity_positive check (quantity > 0),
  constraint goods_receipt_items_price_not_negative check (unit_price >= 0),
  constraint goods_receipt_items_id_workspace_key unique (id, workspace_id),
  constraint goods_receipt_items_receipt_same_workspace
    foreign key (goods_receipt_id, workspace_id) references goods_receipts (id, workspace_id),
  constraint goods_receipt_items_product_same_workspace
    foreign key (product_id, workspace_id) references products (id, workspace_id)
);

create index goods_receipt_items_receipt on goods_receipt_items (goods_receipt_id);

alter table goods_receipt_items
  add constraint goods_receipt_items_movement_same_workspace
  foreign key (stock_movement_id, workspace_id) references stock_movements (id, workspace_id);

-- Retur pembelian ----------------------------------------------------------------
-- A-03: retur mengurangi stok dan mengurangi nilai utang pada PO terkait, dan
-- ditolak bila saldo di lokasi tidak cukup.

create table purchase_returns (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_order_id bigint,
  supplier_id bigint not null,
  location_id bigint not null,
  number text not null,
  returned_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  note text,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint purchase_returns_id_workspace_key unique (id, workspace_id),
  constraint purchase_returns_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id),
  constraint purchase_returns_location_same_workspace foreign key (location_id, workspace_id)
    references locations (id, workspace_id),
  constraint purchase_returns_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

create unique index purchase_returns_workspace_number on purchase_returns (workspace_id, number);

create table purchase_return_items (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_return_id bigint not null,
  product_id bigint not null,
  quantity numeric(18, 4) not null,
  unit_price bigint not null,
  stock_movement_id bigint,
  created_at timestamptz not null default now(),
  constraint purchase_return_items_quantity_positive check (quantity > 0),
  constraint purchase_return_items_id_workspace_key unique (id, workspace_id),
  constraint purchase_return_items_return_same_workspace
    foreign key (purchase_return_id, workspace_id) references purchase_returns (id, workspace_id),
  constraint purchase_return_items_product_same_workspace
    foreign key (product_id, workspace_id) references products (id, workspace_id)
);

create index purchase_return_items_return on purchase_return_items (purchase_return_id);

alter table purchase_return_items
  add constraint purchase_return_items_movement_same_workspace
  foreign key (stock_movement_id, workspace_id) references stock_movements (id, workspace_id);

-- Pembayaran supplier ---------------------------------------------------------
-- PRD 6.3: catat tanggal, jumlah, metode, dan referensi; sistem menampilkan sisa
-- utang per supplier dan per PO. A-08: pembayaran tanpa PO yang dipilih dialokasikan
-- FIFO berdasarkan jatuh tempo lalu nomor PO.

create table supplier_payments (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  supplier_id bigint not null,
  purchase_order_id bigint,
  number text not null,
  paid_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  amount bigint not null,
  method text not null,
  reference text,
  note text,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint supplier_payments_amount_positive check (amount > 0),
  constraint supplier_payments_method_not_blank check (length(btrim(method)) > 0),
  constraint supplier_payments_id_workspace_key unique (id, workspace_id),
  constraint supplier_payments_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id),
  constraint supplier_payments_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

create unique index supplier_payments_workspace_number on supplier_payments (workspace_id, number);
create index supplier_payments_supplier on supplier_payments (supplier_id, paid_on desc);

create table supplier_payment_allocations (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  supplier_payment_id bigint not null,
  purchase_order_id bigint not null,
  amount bigint not null,
  created_at timestamptz not null default now(),
  constraint supplier_payment_allocations_amount_positive check (amount > 0),
  constraint supplier_payment_allocations_id_workspace_key unique (id, workspace_id),
  constraint supplier_payment_allocations_payment_same_workspace
    foreign key (supplier_payment_id, workspace_id) references supplier_payments (id, workspace_id),
  constraint supplier_payment_allocations_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

create unique index supplier_payment_allocations_unique_order
  on supplier_payment_allocations (supplier_payment_id, purchase_order_id);

-- Barang yang sampai tanpa PO dihitung sebagai utang supplier juga, karena
-- receive-nya nyata dan uangnya akan keluar.
create table supplier_debt_entries (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  supplier_id bigint not null,
  purchase_order_id bigint,
  goods_receipt_id bigint,
  purchase_return_id bigint,
  amount bigint not null,
  entry_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint supplier_debt_entries_amount_positive check (amount <> 0),
  constraint supplier_debt_entries_id_workspace_key unique (id, workspace_id),
  constraint supplier_debt_entries_supplier_same_workspace foreign key (supplier_id, workspace_id)
    references suppliers (id, workspace_id)
);

create index supplier_debt_entries_supplier on supplier_debt_entries (supplier_id, entry_date);
create index supplier_debt_entries_receipt
  on supplier_debt_entries (goods_receipt_id) where goods_receipt_id is not null;
create index supplier_debt_entries_return
  on supplier_debt_entries (purchase_return_id) where purchase_return_id is not null;

-- Retur mengurangi utang, jadi nilainya boleh negatif. Batasnya hanya satu: total
-- retur tidak boleh melebihi nilai yang benar-benar diterima pada PO yang sama.
-- Dihitung dari penerimaan dikurangi retur yang sudah tercatat, bukan dari baris
-- retur yang sedang dibuat: pada trigger before insert, baris itu belum ada.
create or replace function guard_return_amount() returns trigger as $$
declare
  diterima bigint;
  sudah_retur bigint;
begin
  if new.purchase_return_id is not null and new.purchase_order_id is not null then
    select coalesce(sum(amount), 0) into diterima
      from supplier_debt_entries
     where workspace_id = new.workspace_id
       and purchase_order_id = new.purchase_order_id
       and goods_receipt_id is not null;

    select coalesce(sum(-amount), 0) into sudah_retur
      from supplier_debt_entries
     where workspace_id = new.workspace_id
       and purchase_order_id = new.purchase_order_id
       and purchase_return_id is not null;

    if abs(new.amount) > greatest(diterima - sudah_retur, 0) then
      raise exception 'retur melebihi nilai penerimaan pada PO ini'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger supplier_debt_entries_guard_return before insert on supplier_debt_entries
  for each row execute function guard_return_amount();
