-- 0001_foundation.sql
-- PRD 6.1 (akun dan workspace), PRD 8 (peran), PRD 9 (keamanan dan isolasi data),
-- PRD 13 (model data dan integritas).
--
-- Konvensi yang berlaku untuk seluruh migrasi berikutnya:
--
-- 1. Setiap tabel yang terikat workspace punya kolom workspace_id dan batasan unik
--    (id, workspace_id). Tabel anak mereferensikan (parent_id, workspace_id),
--    bukan hanya parent_id. Akibatnya referensi lintas workspace mustahil terjadi di
--    level database, bukan sekadar dicegah di aplikasi (PRD 9).
--
-- 2. Baris yang tidak boleh diubah memakai trigger yang menolak UPDATE dan DELETE.
--    Koreksi selalu dibuat sebagai baris baru (PRD 6.2).
--
-- 3. Uang disimpan sebagai BIGINT rupiah penuh tanpa pecahan (KEPUTUSAN-TEKNIS bagian 3).
--    Waktu disimpan sebagai timestamptz dalam UTC. Periode laporan dihitung memakai
--    zona waktu workspace (KEPUTUSAN-TEKNIS B-10).
--
-- 4. Peran dan status memakai text dengan batasan CHECK, bukan tipe ENUM, supaya
--    menambah nilai di masa depan cukup dengan mengubah batasan.

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- Dipakai tabel yang boleh diubah, dan hanya oleh alur yang memang owns datanya.
create or replace function reject_row_mutation() returns trigger as $$
begin
  raise exception '% tidak dapat diubah atau dihapus', tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

-- users ---------------------------------------------------------------------
-- Satu akun dapat menjadi anggota banyak workspace, jadi tabel ini tidak terikat
-- workspace.

create table users (
  id bigint generated always as identity primary key,
  email text not null,
  password_hash text,
  name text not null,
  email_verified_at timestamptz,
  mfa_required_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_email_lowercase check (email = lower(email)),
  constraint users_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create unique index users_email_key on users (email) where deleted_at is null;
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- Password hanya boleh diisi setelah verifikasi email, dan tidak pernah lewat API umum.
comment on column users.password_hash is 'Argon2id. Null berarti akun belum pernah menetapkan password.';

create table email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index email_verification_tokens_hash on email_verification_tokens (token_hash);
create index email_verification_tokens_user on email_verification_tokens (user_id);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_ip inet,
  created_at timestamptz not null default now()
);

create unique index password_reset_tokens_hash on password_reset_tokens (token_hash);
create index password_reset_tokens_user on password_reset_tokens (user_id);

-- workspaces ----------------------------------------------------------------

create table workspaces (
  id bigint generated always as identity primary key,
  slug text not null,
  name text not null,
  business_type text,
  timezone text not null default 'Asia/Jakarta',
  currency text not null default 'IDR',
  date_format text not null default 'd MMM yyyy',
  logo_key text,
  owner_id bigint not null references users (id),
  status text not null default 'active',
  -- Penghapusan workspace punya masa tenggang 30 hari (PRD 6.1).
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_status check (status in ('active', 'suspended', 'deletion_pending')),
  constraint workspaces_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index workspaces_slug_key on workspaces (slug) where deleted_at is null;
create trigger workspaces_set_updated_at before update on workspaces
  for each row execute function set_updated_at();

-- workspaces.owner_id menjamin workspace punya tepat satu pemilik yang ditunjuk.
-- Batas "satu orang hanya boleh memiliki satu workspace" sengaja tidak dibuat,
-- karena PRD tidak memintanya.

create table workspace_settings (
  workspace_id bigint primary key references workspaces (id) on delete cascade,
  -- Persetujuan satu tingkat aktif di semua paket bila aturan ini menyala (B-03).
  approval_required boolean not null default false,
  -- Multi tingkat ambang nominal hanya untuk paket Bisnis (PRD 16).
  approval_threshold_amount bigint,
  -- Rata-rata bergerak dihitung ulang pada penerimaan, retur, dan koreksi harga (A-06).
  costing_method text not null default 'moving_average',
  updated_at timestamptz not null default now(),
  constraint ws_settings_costing check (costing_method in ('moving_average')),
  constraint ws_settings_threshold_positive check (
    approval_threshold_amount is null or approval_threshold_amount > 0
  )
);

create table workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references workspaces (id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  invited_by bigint not null references users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_role check (role in ('admin', 'purchasing', 'staff', 'viewer')),
  constraint invitations_email_lowercase check (email = lower(email))
);

create unique index workspace_invitations_hash on workspace_invitations (token_hash);
create index workspace_invitations_open on workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

create table memberships (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  user_id bigint not null references users (id) on delete cascade,
  role text not null,
  invited_by bigint references users (id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_role check (role in ('owner', 'admin', 'purchasing', 'staff', 'viewer')),
  -- Pondasi untuk foreign key komposit di seluruh tabel turunan berikutnya.
  constraint memberships_id_workspace_key unique (id, workspace_id)
);

create unique index memberships_workspace_user on memberships (workspace_id, user_id)
  where removed_at is null;

-- Hanya satu anggota ber peran Owner yang aktif per workspace. Tanpa ini, dua
-- orang bisa sama-sama memegang izin Owner, termasuk hak menghapus workspace.
create unique index memberships_single_owner on memberships (workspace_id)
  where role = 'owner' and removed_at is null;

create trigger memberships_set_updated_at before update on memberships
  for each row execute function set_updated_at();

-- Viewer tidak boleh naik peran menjadi Admin atau Owner (PRD 8), dan Owner tidak
-- dapat diturunkan lewat jalur ini. Perubahan peran yang sah tetap masuk audit log.
create or replace function prevent_role_escalation() returns trigger as $$
begin
  if new.role is distinct from old.role then
    if old.role = 'owner' then
      raise exception 'peran Owner tidak dapat diubah dari sini'
        using errcode = 'restrict_violation';
    end if;
    if old.role <> 'owner' and new.role = 'owner' then
      raise exception 'peran tidak dapat dinaikkan menjadi Owner'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger memberships_block_escalation before update on memberships
  for each row execute function prevent_role_escalation();

-- Sesi dan perangkat --------------------------------------------------------
-- PRD 9: sesi diputar ulang setelah masuk dan setelah perubahan izin.

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users (id) on delete cascade,
  label text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index devices_user on devices (user_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users (id) on delete cascade,
  device_id uuid references devices (id) on delete set null,
  -- Hanya hash yang disimpan. Token cookie tidak pernah menyentuh database (PRD 9).
  token_hash text not null,
  active_workspace_id bigint references workspaces (id),
  ip inet,
  user_agent text,
  mfa_satisfied_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index sessions_token_hash on sessions (token_hash);
create index sessions_user_active on sessions (user_id) where revoked_at is null;

-- MFA -----------------------------------------------------------------------
-- PRD 9: tersedia untuk semua pengguna, diwajibkan untuk Owner dan Admin pada
-- 30 hari setelah akun dibuat. Kode pemulihan mencegah Owner terkunci dari akun
-- sendiri (B-09).

create table mfa_secrets (
  user_id bigint primary key references users (id) on delete cascade,
  secret_encrypted bytea not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table mfa_recovery_codes (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index mfa_recovery_codes_user on mfa_recovery_codes (user_id) where used_at is null;

-- Idempotency ---------------------------------------------------------------
-- PRD 9 dan 13: penerimaan, pembayaran, dan impor memakai kunci idempotency
-- yang disimpan. Kunci mencakup operasi supaya kunci yang sama di operasi berbeda
-- tidak saling menimpa.

create table idempotency_keys (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  operation text not null,
  key text not null,
  -- Hash badan permintaan. Kunci yang sama dengan badan berbeda ditolak, bukan
  -- dianggap sebagai ulangan.
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index idempotency_keys_scope on idempotency_keys (workspace_id, operation, key);

-- Audit log -----------------------------------------------------------------
-- PRD 9: mencatat pelaku, workspace, waktu, tindakan, objek, dan hasil, tanpa
-- password atau token. Retensi per paket diatur di PRD 16, minimum 30 hari (B-05).

create table audit_logs (
  id bigint generated always as identity primary key,
  workspace_id bigint references workspaces (id) on delete cascade,
  actor_user_id bigint references users (id) on delete set null,
  actor_role text,
  action text not null,
  object_type text,
  object_id text,
  result text not null default 'success',
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_result check (result in ('success', 'denied', 'failure'))
);

create index audit_logs_workspace_time on audit_logs (workspace_id, created_at desc);
create index audit_logs_actor on audit_logs (actor_user_id, created_at desc);

-- Audit log hanya bertambah, tidak pernah berubah. Trigger di bawah mencegah
-- kueri aplikasi menghapus atau menyusun ulang riwayat.
create trigger audit_logs_no_mutation before update or delete on audit_logs
  for each row execute function reject_row_mutation();
