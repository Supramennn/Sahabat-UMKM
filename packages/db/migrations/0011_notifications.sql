-- PRD 6.9: email dan notifikasi di dalam aplikasi untuk stok rendah, PO menunggu
-- persetujuan, keputusan PO, utang jatuh tempo, undangan, dan aktivitas keamanan
-- akun, plus ringkasan harian opsional yang bisa diatur tiap pengguna.
--
-- Baris notifikasi ditulis di dalam transaksi yang sama dengan peristiwanya,
-- sedangkan email dikirim menyusul dari antrean (kolom emailed_at) supaya
-- kegagalan pengiriman email tidak pernah membatalkan transaksi bisnis dan
-- email tidak pernah terkirim untuk transaksi yang akhirnya gagal.
--
-- workspace_id boleh null untuk notifikasi tingkat akun, misalnya aktivitas
-- keamanan, yang tidak terikat workspace mana pun. Notifikasi workspace selalu
-- membawa workspace_id, jadi daftar di satu workspace tidak pernah bocor ke
-- workspace lain.

create table notifications (
  id bigint generated always as identity primary key,
  workspace_id bigint references workspaces (id) on delete cascade,
  user_id bigint not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  in_app boolean not null default true,
  email_requested boolean not null default true,
  dedupe_key text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_kind check (
    kind in (
      'stok_rendah',
      'po_menunggu',
      'po_disetujui',
      'po_ditolak',
      'utang_jatuh_tempo',
      'undangan',
      'keamanan'
    )
  )
);

-- Kunci pencegah pengulangan: satu baris per pengguna dan kunci. Dipakai stok
-- rendah (satu kali per produk per hari) dan utang jatuh tempo (sekali per hari).
create unique index notifications_dedupe_unique
  on notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index notifications_inbox
  on notifications (user_id, workspace_id, created_at desc);

-- Antrean email: indeks parsial supaya pengirim hanya memindai baris yang belum
-- dikirim, bukan seluruh tabel.
create index notifications_email_queue
  on notifications (id)
  where email_requested and emailed_at is null;

-- Pengaturan per pengguna dan per jenis. Baris yang tidak ada berarti kedua kanal
-- menyala, jadi menghapus preferensi selalu bisa dikembalikan ke bawaan.
create table notification_preferences (
  user_id bigint not null references users (id) on delete cascade,
  kind text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),
  constraint notification_preferences_kind check (
    kind in (
      'stok_rendah',
      'po_menunggu',
      'po_disetujui',
      'po_ditolak',
      'utang_jatuh_tempo',
      'undangan',
      'keamanan'
    )
  )
);

create trigger notification_preferences_set_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();

-- Ringkasan harian: opsional, jadi bawaan mati. last_digest_at mencegah kirim
-- dobel dalam satu hari kalender pengguna.
create table notification_digest_settings (
  user_id bigint primary key references users (id) on delete cascade,
  enabled boolean not null default false,
  last_digest_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger notification_digest_settings_set_updated_at
  before update on notification_digest_settings
  for each row execute function set_updated_at();
