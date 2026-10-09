-- 0002_identity.sql
-- PRD 6.1 (akun, workspace, anggota, perangkat), PRD 8 (peran), PRD 9 (autentikasi dan sesi).
--
-- Tabel yang sudah ada di 0001 tidak diubah strukturnya di sini. Kolom yang
-- ternyata kurang ditambahkan lewat ALTER TABLE, dan tabel baru dibuat terpisah.

create or replace function reject_row_mutation() returns trigger as $$
begin
  raise exception '% tidak dapat diubah atau dihapus', tg_table_name
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

-- Sesi perlu tahu workspace aktif supaya pemilih workspace tidak memakai
-- parameter dari peramban sebagai bukti (PRD 9).
alter table sessions add column if not exists last_ip inet;

create index if not exists sessions_workspace on sessions (active_workspace_id)
  where revoked_at is null;

-- Percobaan masuk. PRD 9 meminta pembatasan per akun dan per alamat IP dengan
-- pemantauan, jadi keduanya dicatat di sini, bukan hanya di memori proses.
create table login_attempts (
  id bigint generated always as identity primary key,
  -- email_hash nullable supaya percobaan dengan email tak dikenal pun tercatat.
  email_hash text,
  ip inet,
  successful boolean not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index login_attempts_email on login_attempts (email_hash, created_at desc);
create index login_attempts_ip on login_attempts (ip, created_at desc);

-- Room. Verifikasi email memakai token acak yang hanya hash-nya yang disimpan.
alter table email_verification_tokens add column if not exists attempt_count integer not null default 0;-- Hash kata sandi sebelumnya, supaya mengganti kata sandi tidak bisa memakai
-- kembali kata sandi yang baru saja dibuang.
create table password_history (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index password_history_user on password_history (user_id, created_at desc);

-- Kode pemulihan MFA. Token hanya hash-nya yang disimpan (PRD 9).
alter table mfa_recovery_codes add column if not exists label text;

create or replace function log_role_change() returns trigger as $$
declare
  -- current_setting mengembalikan text, jadi harus dikonversi sebelum masuk ke
  -- kolom bigint. Sysid yang tidak disetel menghasilkan string kosong, bukan NULL.
  actor bigint;
begin
  if new.role is distinct from old.role then
    begin
      actor := nullif(current_setting('app.actor_user_id', true), '')::bigint;
    exception when others then
      actor := null;
    end;

    insert into audit_logs (workspace_id, actor_user_id, action, object_type, object_id, metadata)
    values (
      new.workspace_id,
      actor,
      'membership.role_changed',
      'membership',
      new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role)
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger memberships_audit_role_change after update on memberships
  for each row execute function log_role_change();
