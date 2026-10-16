-- 0008_expenses.sql
-- PRD 6.5: pengeluaran operasional dengan tanggal, kategori, deskripsi, nominal,
-- referensi, lampiran foto atau PDF, dan pembuat. Kategori diatur Owner dan Admin.
-- Pembelian barang lewat PO tidak boleh dicatat ulang sebagai pengeluaran.
--
-- Konvensi yang sama dengan migrasi sebelumnya: batasan unik (id, workspace_id),
-- foreign key komposit untuk tabel turunan, dan waktu dalam UTC.

-- Kategori pengeluaran ---------------------------------------------------------
-- Kategori hanya dikelola Owner dan Admin (PRD 6.5), dan pengarsipan menggantikan
-- penghapusan supaya pengeluaran lama tetap punya kategori yang bisa dibaca di laporan.

create table expense_categories (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint expense_categories_id_workspace_key unique (id, workspace_id)
);

create unique index expense_categories_workspace_name
  on expense_categories (workspace_id, lower(name))
  where not is_archived;

create trigger expense_categories_set_updated_at before update on expense_categories
  for each row execute function set_updated_at();

-- Pengeluaran -----------------------------------------------------------------

create table expenses (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  spent_on date not null,
  category_id bigint,
  description text not null,
  -- Rupiah penuh tanpa pecahan (KEPUTUSAN-TEKNIS bagian 3).
  amount bigint not null,
  reference text,
  -- PRD 6.5: pembelian barang lewat PO tidak dicatat ulang sebagai pengeluaran.
  -- Hubungan ini opsional, tapi kalau diisi, satu PO hanya boleh dipakai satu kali.
  purchase_order_id bigint,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_description_not_blank check (length(btrim(description)) > 0),
  constraint expenses_id_workspace_key unique (id, workspace_id),
  constraint expenses_category_same_workspace foreign key (category_id, workspace_id)
    references expense_categories (id, workspace_id),
  constraint expenses_order_same_workspace foreign key (purchase_order_id, workspace_id)
    references purchase_orders (id, workspace_id)
);

-- Batasan penautan ganda. Melampirkan PO yang sama ke dua pengeluaran berarti
-- nilai belanja terhitung dua kali, dan itu kesalahan yang tidak terlihat di layar.
create unique index expenses_single_order_link on expenses (purchase_order_id)
  where purchase_order_id is not null;

create index expenses_workspace_time on expenses (workspace_id, spent_on desc, id desc);
create index expenses_category_time on expenses (category_id, spent_on desc, id desc);

-- Pengeluaran yang sudah tercatat tidak diedit dari layar. Koreksi dibuat sebagai
-- pengeluaran baru yang merujuk ke yang lama, sama seperti ledger stok.
create trigger expenses_no_delete before delete on expenses
  for each row execute function reject_row_mutation();

-- Lampiran ---------------------------------------------------------------------

create table expense_attachments (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  expense_id bigint not null,
  kind text not null,
  -- Kunci objek di penyimpanan berkas. Nama berkas asli hanya disimpan untuk
  -- ditampilkan; nama itu tidak pernah dipakai untuk membentuk jalur.
  object_key text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  constraint expense_attachments_kind check (kind in ('foto', 'pdf')),
  constraint expense_attachments_size_positive check (size_bytes > 0),
  constraint expense_attachments_id_workspace_key unique (id, workspace_id),
  constraint expense_attachments_expense_same_workspace foreign key (expense_id, workspace_id)
    references expenses (id, workspace_id)
);

create index expense_attachments_expense on expense_attachments (expense_id, id);

create trigger expense_attachments_no_mutation before update or delete on expense_attachments
  for each row execute function reject_row_mutation();

-- Batas jumlah lampiran per pengeluaran. Tanpa batas, satu pengeluaran bisa menyimpan
-- ribuan berkas dan satu permintaan daftar jadi berat tanpa alasan.
create or replace function check_expense_attachment_limit() returns trigger as $$
begin
  if (
    select count(*) from expense_attachments
     where expense_id = new.expense_id and workspace_id = new.workspace_id
  ) >= 5 then
    raise exception 'satu pengeluaran maksimal punya 5 lampiran'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger expense_attachments_limit before insert on expense_attachments
  for each row execute function check_expense_attachment_limit();