-- Penagihan langganan (PRD 6.10): pembayaran lewat Midtrans, satu tagihan per
-- percobaan bayar, dan faktur PDF yang diunduh pemilik workspace.
--
-- Nomor tagihan datang dari sequence global, bukan document_sequences per
-- workspace. Faktur diterbitkan penjual untuk semua pelanggan, jadi nomornya
-- harus berurutan untuk satu penjual, bukan berulang dari satu di setiap
-- workspace (bandingkan ARSITEKTUR, "Nomor dokumen").
--
-- Baris pembayaran dibuat sebelum tautan pembayaran diminta ke Midtrans, jadi
-- uang yang masuk selalu punya baris yang bisa ditelusuri. Tagihan yang tidak
-- dibayar sampai expires_at diubah menjadi 'kedaluwarsa' oleh tugas harian.

create sequence payment_numbers;

create table payments (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces (id) on delete cascade,
  number text not null default (
    'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('payment_numbers')::text, 5, '0')
  ),
  plan_code text not null,
  billing_period text not null,
  amount bigint not null,
  status text not null default 'menunggu',
  provider text not null default 'midtrans',
  provider_order_id text not null,
  provider_token text,
  provider_redirect_url text,
  payment_method text,
  paid_at timestamptz,
  expires_at timestamptz not null,
  created_by bigint references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_plan check (plan_code in ('usaha', 'bisnis')),
  constraint payments_period check (billing_period in ('bulanan', 'tahunan')),
  constraint payments_amount check (amount > 0),
  constraint payments_status check (status in ('menunggu', 'dibayar', 'gagal', 'kedaluwarsa')),
  constraint payments_paid_at check ((status = 'dibayar') = (paid_at is not null))
);

create unique index payments_number_unique on payments (number);

-- Satu nomor pesanan Midtrans hanya menunjuk satu baris, jadi notifikasi yang
-- dikirim berulang menemukan baris yang sama, bukan membuat baris baru.
create unique index payments_provider_order_unique on payments (provider, provider_order_id);

create index payments_workspace on payments (workspace_id, created_at desc);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- Masa berlangganan berbayar. Masa uji coba sudah punya kolomnya sendiri;
-- kolom di bawah ini hanya terisi setelah pembayaran pertama diterima, dan
-- dikosongkan lagi saat langganan tidak diperpanjang supaya workspace kembali
-- ke paket Gratis dengan aturan yang sama seperti uji coba yang berakhir.
--
-- Waktu pengingat disimpan per masa, bukan per pengiriman: pengingat tujuh hari
-- dan satu hari (PRD 6.10) hanya boleh terkirim sekali untuk satu tanggal jatuh
-- tempo, dan direset begitu masa baru dimulai.
alter table workspace_subscriptions
  add column current_period_end timestamptz,
  add column billing_period text,
  add column renewal_reminder_7d_at timestamptz,
  add column renewal_reminder_1d_at timestamptz,
  add constraint workspace_subscriptions_billing_period
    check (billing_period is null or billing_period in ('bulanan', 'tahunan')),
  add constraint workspace_subscriptions_period
    check ((current_period_end is null) = (billing_period is null));
