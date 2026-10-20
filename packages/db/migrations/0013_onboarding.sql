-- 0013: daftar periksa aktivasi di dashboard (PRD 12).
--
-- Alur aktivasi: buat workspace, isi nama dan jenis usaha, masukkan produk,
-- atur stok awal dan batas minimum, catat transaksi pertama. Keadaan selesai
-- dihitung langsung dari data workspace, sehingga tabel ini hanya menyimpan
-- langkah yang sengaja dilewati pengguna. Keadaan skip disimpan di server, bukan
-- di peramban, supaya sama untuk semua anggota dan semua perangkat.

create table workspace_onboarding_skips (
  workspace_id bigint not null references workspaces (id) on delete cascade,
  step text not null,
  created_by bigint not null references users (id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, step),
  constraint onboarding_skip_step check (step in ('profil_usaha', 'produk', 'stok_awal', 'transaksi'))
);
