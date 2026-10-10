-- 0005_purchase_order_shares.sql
-- PRD 6.3: PO dapat diunduh sebagai PDF dan dikirim lewat email atau dibagikan
-- sebagai tautan baca-saja. A-11: tautannya bertoken acak, kedaluwarsa 30 hari
-- secara bawaan dan dapat diubah Owner, dapat dicabut kapan saja, diberi noindex,
-- dan setiap pembukaan masuk audit log dengan IP dan waktu.
--
-- Yang disimpan hanya hash token, jadi isi tabel yang bocor tidak cukup untuk
-- membuka tautan mana pun (PRD 9).

create table purchase_order_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references workspaces (id) on delete cascade,
  purchase_order_id bigint not null,
  label text,
  token_hash text not null,
  -- Bawaan 30 hari, dan Owner boleh menetapkan sendiri lewat parameter.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  last_opened_at timestamptz,
  last_opened_ip inet,
  open_count integer not null default 0,
  constraint purchase_order_shares_label_not_blank check (label is null or length(btrim(label)) > 0),
  constraint purchase_order_shares_id_workspace_key unique (id, workspace_id),
  constraint purchase_order_shares_order_same_workspace
    foreign key (purchase_order_id, workspace_id) references purchase_orders (id, workspace_id)
);

-- Satu tautan hidup per PO. Berbagi ulang berarti mencabut tautan lama, supaya
-- ada tepat satu alamat yang bisa dibuka untuk setiap PO.
create unique index purchase_order_shares_live on purchase_order_shares (purchase_order_id)
  where revoked_at is null;

create unique index purchase_order_shares_token_hash on purchase_order_shares (token_hash);

-- Berapa lama tautan hidup, diatur Owner di pengaturan workspace. PRD 6.3 tidak
-- menetapkan angkanya, jadi 30 hari adalah nilai bawaan A-11 dan bisa diubah.
alter table workspace_settings
  add column if not exists po_share_ttl_days integer not null default 30;

alter table workspace_settings
  add constraint ws_settings_share_ttl check (po_share_ttl_days between 1 and 365);
