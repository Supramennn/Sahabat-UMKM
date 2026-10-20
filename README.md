# Sahabat UMKM

Aplikasi web untuk mencatat stok, mengelola pembelian ke supplier, mencatat penjualan,
dan membaca laporan usaha UMKM.

Sumber kebenaran produk adalah `docs/PRD-Sahabat-UMKM.md`. Keputusan teknis yang PRD
delegasikan ke tim tercatat di `docs/KEPUTUSAN-TEKNIS.md`. PRD menang bila keduanya
berbeda.

## Sebelum mulai

Sebelum mengerjakan UI, tanyakan kepada pengguna kapan antislop dipakai: selama
pengerjaan atau setelah selesai. Jangan mulai UI sebelum ada jawaban.

## Tumpukan teknologi

| Bagian | Pilihan |
| --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4, Motion (Framer Motion), dengan token warna PRD 10 sebagai tema Tailwind |
| API | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL 16 |
| Antrean | pg-boss |
| Pengujian | Vitest, Playwright, Testing Library, axe-core |

Perangkat tambahan untuk pengujian:

| Perangkat | Kegunaan |
| --- | --- |
| `@axe-core/playwright` | Pemeriksaan axe pada halaman yang benar-benar dirender |
| `@testing-library/react` | Uji komponen di jsdom: penomoran halaman, keadaan kosong, tombol pembatalan |
| `@vitejs/plugin-react` | Mengubah JSX saat berkas komponen diuji, karena `jsx: preserve` milik Next.js tidak berlaku di Vitest |

Antarmuka memakai Tailwind CSS v4; warna hanya boleh berasal dari tema yang dibangun
dari `packages/design-tokens`. Arah desain dan aturan pemakaiannya ada di `DESIGN.md`.
Keputusan dan alasannya tercatat di K-19 pada `docs/KEPUTUSAN-TEKNIS.md`.

## Cara menjalankan aplikasi

Butuh Node.js 22 atau lebih baru. PostgreSQL dan MinIO disediakan lewat Docker
Compose. Kalau Docker belum tersedia, pakai jalur cepat PGlite di bawah.

### 1. Pasang dependensi

```bash
npm install
```

### 2. Siapkan konfigurasi

```bash
cp .env.example .env
```

Nilai bawaan di `.env.example` cocok dengan `docker-compose.yml`, jadi untuk
pengembangan lokal tidak ada yang perlu diubah. Dua nilai ini masih contoh dan
sebaiknya diganti sebelum aplikasi dipakai dengan data sungguhan:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # MFA_ENCRYPTION_SECRET
```

Perintah API dan migrasi membaca `.env` dari akar repositori, jadi nilainya tidak
perlu di-export manual. Berkas `.env` tidak pernah ikut ke git.

`NEXT_PUBLIC_SITE_URL` dipakai seluruh halaman publik untuk URL kanonik, open graph,
peta situs, dan data terstruktur; ganti ke alamat produksi saat aplikasi dipasang di
domain sungguhan.

Penagihan langganan (PRD 6.10) mati secara bawaan. Ia hanya menyala kalau
`MIDTRANS_SERVER_KEY`, `BILLING_SELLER_NAME`, `BILLING_SELLER_ADDRESS`,
`BILLING_SELLER_EMAIL`, dan `BILLING_REFUND_POLICY_URL` diisi; tanpa itu halaman paket
menjelaskan bahwa pembayaran belum diaktifkan dan uji coba 14 hari tetap bisa dipakai.
Untuk pemeriksaan manual tanpa kunci Midtrans, `npx tsx scripts/dev-api.mts` sudah
menyalakan gateway simulasi (`PAYMENT_SIMULATION=1`, diabaikan di produksi).

### 3. Nyalakan PostgreSQL dan MinIO

```bash
npm run db:up
```

PostgreSQL terbuka di `127.0.0.1:5432` dan MinIO di `127.0.0.1:9000` dengan konsol
di `127.0.0.1:9001`. Modul lampiran saat ini memakai folder lokal, bukan MinIO;
isi `OBJECT_STORAGE_DIR` di `.env` (misalnya `.object-storage`, sudah masuk
.gitignore) supaya unggah foto dan lampiran aktif.

### 4. Terapkan migrasi

```bash
npm run migrate
```

### 5. Jalankan API dan frontend

Di dua terminal:

```bash
npm run dev:api     # terminal pertama, http://localhost:4000
npm run dev:web     # terminal kedua, http://localhost:3000
```

API hanya menerima permintaan dari asal yang terdaftar, jadi buka aplikasinya
lewat `http://localhost:3000`, bukan `http://127.0.0.1:3000`.

### 6. Pakai aplikasinya

Buat akun di `http://localhost:3000/buat-akun`, verifikasi email, lalu masuk.
Selama penyedia email bawaan dipakai, email tidak benar-benar terkirim: tautan
verifikasi tercetak di log API selama pengembangan. Di produksi isi email tidak
pernah masuk log, karena token di log adalah kebocoran kredensial.

### Menghentikan layanan

```bash
npm run db:down
```

### Jalur cepat tanpa Docker

API bisa berjalan dengan database PGlite dalam memori. Cocok untuk mencoba seluruh
alur, tetapi data hilang saat proses berhenti.

```bash
npx tsx scripts/dev-api.mts     # terminal pertama, http://127.0.0.1:4000
npm run dev:web                 # terminal kedua, http://localhost:3000
```

### Pengujian otomatis

Tes tidak butuh Docker maupun server database:

```bash
npm test
```

### Jika muncul "Cannot find module './NNN.js'"

Folder `apps/web/.next` menyimpan hasil kompilasi frontend. Kalau isinya bercampur
antara hasil `next build` dan `next dev` — misalnya `npm run start` dan
`npm run dev:web` pernah pakai folder yang sama, atau prosesnya dihentikan di
tengah kompilasi — halaman bisa gagal dibuka dengan galat itu. Hentikan server
web, hapus foldernya, lalu jalankan ulang:

```bash
rm -rf apps/web/.next        # di PowerShell: Remove-Item -Recurse -Force apps/web/.next
npm run dev:web
```

Jangan jalankan `npm run dev:web` bersamaan dengan `npm run build --workspace
apps/web` atau `npm run start --workspace apps/web`; keduanya memakai folder
`.next` yang sama.

## Uji aksesibilitas

Butuh frontend produksi dan API yang sudah berjalan. API harus diakses lewat
`localhost`, karena hanya asal itu yang diizinkan oleh CORS.

```bash
npm run build --workspace apps/web
npx tsx scripts/dev-api.mts                       # terminal pertama
npm run start --workspace apps/web                # terminal kedua
npm run test:e2e
```

## CI

Tiga job berjalan sendiri di `.github/workflows`:

| Job | Isi |
| --- | --- |
| `verify` | lint, typecheck, tes, kontras warna, build frontend |
| `postgres-concurrency` | Tes konkurensi terhadap PostgreSQL sungguhan, memakai layanan CI |
| `e2e` | Uji aksesibilitas Playwright di ponsel dan desktop |

Tes konkurensi butuh dua koneksi PostgreSQL, jadi tidak bisa berjalan di PGlite.
Job `verify` sengaja tidak memorinya. Di mesin tanpa Docker, `npm run
test:postgres:local` menyalakan klaster PostgreSQL tertanam lalu menjalankan tes
yang sama.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm test` | Semua tes tanpa server database, memakai PGlite |
| `npm run test:contrast` | Hitung kontras setiap pasangan warna komponen, gagal kalau ada yang di bawah ambang |
| `npm run test:e2e` | Uji aksesibilitas Playwright di ponsel dan desktop. Butuh API dan frontend sudah berjalan |
| `npm run dev:api` | Jalankan API dengan PostgreSQL dari `.env` |
| `npm run dev:web` | Jalankan frontend Next.js di http://localhost:3000 |
| `npm run db:up` | Nyalakan PostgreSQL dan MinIO lewat Docker Compose |
| `npm run db:down` | Hentikan layanan Docker Compose |
| `npx tsx scripts/dev-api.mts` | Jalankan API dengan database PGlite dalam memori, untuk pemeriksaan manual tanpa PostgreSQL |
| `npm run test:postgres` | Tes yang butuh PostgreSQL sungguhan, setel `TEST_DATABASE_URL` |
| `npm run test:postgres:local` | Jalankan tes PostgreSQL sungguhan tanpa Docker, memakai klaster tertanam di `.pgdata` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript di seluruh workspace |
| `npm run verify` | lint, typecheck, dan tes |
| `npm run migrate` | Terapkan migrasi ke `DATABASE_URL` |

## Struktur

```
apps/
  api/            Fastify
  web/            Next.js
packages/
  db/             migrasi SQL, klien, harness pengujian
  design-tokens/  token warna PRD 10 dan perhitungan kontras
  shared/         matriks izin PRD 8, format Rupiah dan tanggal, perhitungan stok
docs/
  PRD-Sahabat-UMKM.md
  KEPUTUSAN-TEKNIS.md
  ARSITEKTUR.md
```

## Modul yang sudah jadi

| Modul | Halaman | PRD |
| --- | --- | --- |
| Akun | masuk, buat akun, verifikasi email, lupa dan atur ulang kata sandi, pengaturan akun | 6.1, 9 |
| Stok | barang, tambah barang, detail barang dan foto, input stok, riwayat, perlu perhatian, impor CSV, lokasi, kategori, stok opname | 6.2, 6.8 |
| Pembelian | ringkasan, supplier, purchase order dan detailnya, penerimaan, retur pembelian, pembayaran supplier | 6.3 |
| Penjualan | daftar penjualan, catat penjualan, detail dan pembatalan, pelanggan, impor CSV | 6.4, 6.8 |
| Pengeluaran | daftar, pencatatan, detail, kategori, lampiran foto/PDF | 6.5 |
| Laporan dan ekspor | laporan usaha, pengaturan impor dan ekspor | 6.6, 6.8 |
| Dashboard | ringkasan usaha, daftar periksa aktivasi (PRD 12), menu lainnya yang memuat panduan singkat per modul | 6.7, 10, 12 |
| PWA | manifest dengan ikon, service worker dengan offline.html, antrean offline catatan stok dengan idempotensi | 10, 20 |
| Notifikasi | daftar notifikasi, pengaturan notifikasi | 6.9 |
| Langganan dan tagihan | paket dan langganan, riwayat pembayaran, faktur PDF | 6.10 |
| Situs publik | beranda + halaman fitur per modul, untuk usaha F&B dan retail, harga, pusat bantuan, tentang, status, kontak, dokumen kebijakan (draf), dengan 7 tangkapan layar data contoh, robots.txt, sitemap.xml, dan data terstruktur | 11, 15 |

## Paket dan langganan

Workspace dimulai pada paket Gratis. Katalog paket, batas produk aktif, anggota,
lokasi, fitur penjualan, retur/utang, opname, dan uji coba 14 hari diterapkan di API;
permintaan bersamaan untuk menambah pemakaian dibatasi dengan kunci workspace.
Workspace baru mendapat baris langganan melalui migrasi database. Harga di katalog
masih usulan PRD, dan uji coba tidak memerlukan kartu. Setelah masa uji coba berakhir,
workspace kembali ke Gratis tanpa menghapus datanya; sejak Fase 11 aturan yang sama
berlaku untuk masa berbayar yang tidak diperpanjang. Fitur yang tidak termasuk paket
ditolak pada server, termasuk untuk sesi opname yang sudah terbuka. Penagihan hanya
menyala kalau kunci Midtrans, identitas penjual, dan tautan kebijakan refund diisi
lewat environment (K-21); selama itu kosong, tombol bayar tidak muncul dan batasan
usaha pada `docs/KEPUTUSAN-TEKNIS.md` masih berlaku.

Fase 6 selesai: migrasi dan katalog paket, aktivasi uji coba, downgrade otomatis,
pemeriksaan batas dan fitur di server, serta pengaturan paket. Verifikasi Fase 6
lulus: `npm run verify` (352 tes lulus, 8 dilewati), `npm run test:contrast` (33
pasangan lolos), `npm run test:postgres:local` (9 lulus, 1 dilewati), build produksi,
dan `npm run test:e2e` (128 lulus di ponsel dan desktop). Billing belum tersedia;
harga yang ditampilkan tetap usulan PRD, bukan harga final.

Fase 7 menambahkan laporan posisi stok dan nilai persediaan, ledger pergerakan stok,
hasil stok opname, pembelian dan retur, utang supplier, penjualan per produk/lokasi,
laba kotor, pengeluaran operasional, serta ringkasan bulanan. Halaman laporan menyediakan
filter tanggal, lokasi, atau supplier yang relevan, definisi metrik, cetak, CSV, dan
XLSX. Akses laporan dan ekspor diperiksa kembali di API per workspace dan peran;
ekspor XLSX hanya tersedia mulai paket Usaha. Laporan tidak menampilkan laba bersih.

Fase 7 juga menambahkan ekspor seluruh data workspace di
`/pengaturan/impor-ekspor`: satu arsip ZIP berisi CSV per tabel bisnis plus
PANDUAN.txt, tersedia untuk semua paket, hanya untuk Owner dan Admin, dan setiap
unduhan masuk audit log. Lampiran biner, riwayat impor, log audit, dan data teknis
tidak ikut diekspor; daftarnya disebut di dalam PANDUAN.txt.

Verifikasi Fase 7 lulus: `npm run verify` (365 tes lulus, 8 dilewati),
`npm run test:contrast` (33 pasangan lolos), `npm run test:postgres:local` (9 lulus,
1 dilewati), build produksi, dan `npm run test:e2e` (136 lulus di ponsel dan
desktop).

Fase 8 menambahkan dashboard di `/dashboard`: enam kartu ringkasan, tren harian
penjualan, pembelian, stok masuk, dan stok keluar (masing-masing dengan ringkasan
teks dan tabel data yang bisa dibuka), distribusi status stok, serta daftar tindakan
untuk barang yang perlu dibeli, PO menunggu persetujuan, utang jatuh tempo, dan barang
mendekati kedaluwarsa. Filter periode dan lokasi mengganti seluruh isi halaman lewat
satu permintaan. Izin tiap bagian mengikuti izin laporan per peran, jadi peran Staf
melihat penjelasan dan tautan halaman kerja, bukan angka yang bukan haknya. Navigasi
bawah ponsel kini sesuai PRD 10: Dashboard, Stok, Pembelian, Penjualan, dan Lainnya,
dengan halaman `/lainnya` memuat sisa menu. Setelah masuk, pengguna mendarat di
dashboard.

Fase 8 juga memperbaiki cacat yang ditemukan saat pemeriksaan manual: daftar barang
(`GET /products`) selalu gagal dengan 500 karena kueri hitung menerima parameter
limit dan offset yang tidak dipakainya. Perbaikannya disertai tes regresi.

Verifikasi Fase 8 lulus: `npm run verify` (372 tes lulus, 8 dilewati),
`npm run test:contrast` (33 pasangan lolos), `npm run test:postgres:local` (9 lulus,
1 dilewati), build produksi, dan `npm run test:e2e` (144 lulus di ponsel dan
desktop).

Fase 9 melengkapi impor sesuai PRD 6.8. Empat jenis impor — barang, supplier, saldo
awal, dan penjualan — menerima berkas CSV maupun XLSX, dengan template yang diunduh
dari server untuk tiap jenis dalam kedua format itu. Jenis berkas ditentukan dari
isinya lewat penanda arsip zip, bukan dari namanya, dan tes memastikan kolom wajib
pada template selalu sama dengan kolom yang diterima validator. Impor saldo awal
menjadi jenis tersendiri karena tiap barisnya butuh lokasi dan tercatat di ledger
sebagai transaksi stok masuk beralasan `saldo_awal`; kolom stok awal di berkas barang
ditolak dengan pesan yang menunjuk halaman itu.

Riwayat impor di `/pengaturan/impor-ekspor` menampilkan tiap impor, jumlah baris yang
tersimpan dan dilewati, serta tombol pembatalannya (B-04). Pembatalan hanya mungkin
selama belum ada transaksi turunan yang menyentuh baris hasil impor; alasannya
ditampilkan di baris riwayat. Pembatalan barang dan supplier menghapus baris master
yang belum terpakai, pembatalan saldo awal menulis baris pembalik di ledger sehingga
riwayat stok tetap utuh, dan pembatalan penjualan memakai jalur pembatalan penjualan
yang sama seperti pembatalan manual. Berkas dengan isi yang sama ditolak selama impor
sebelumnya belum dibatalkan. Impor memakai kunci idempotency seperti penerimaan dan
pembayaran, dan batas jumlah produk aktif dari paket ikut diperiksa saat impor barang.

Verifikasi Fase 9 lulus: `npm run verify` (415 tes lulus, 8 dilewati),
`npm run test:contrast` (35 pasangan lolos), `npm run test:postgres:local` (9 lulus,
1 dilewati), build produksi, dan `npm run test:e2e` (152 lulus di ponsel dan desktop).

Celah UI akun dan workspace dari PRD 6.1 ditutup setelah Fase 9. Akun yang belum punya
usaha diarahkan ke `/buat-usaha`, dan akun yang menjadi anggota beberapa usaha mendapat
pemilih usaha di bilah atas. Halaman `/pengaturan/usaha` mengubah nama, jenis usaha, dan
zona waktu (mata uang tetap Rupiah), `/pengaturan/anggota` mengirim undangan, mengubah
peran, dan mengeluarkan anggota sesuai matriks izin PRD 8, dan `/undangan` menerima
undangan. Email undangan kini berisi tautan halaman itu, bukan token mentah; tautannya
sekali pakai dan kedaluwarsa. Dashboard juga tidak lagi meminta daftar lokasi untuk
peran yang tidak boleh membacanya. Verifikasi celah ini: `npm run verify` (419 tes
lulus, 8 dilewati), `npm run test:contrast` (35 pasangan), `npm run test:postgres:local`
(9 lulus, 1 dilewati), build produksi, dan `npm run test:e2e` (174 lulus di ponsel dan
desktop). Belum ada: penghapusan usaha dengan masa tenggang 30 hari dan unggah logo
usaha karena endpoint-nya belum dibuat, serta format tanggal per usaha yang belum
dipakai di tampilan.

Fase 10 menambahkan notifikasi email dan di dalam aplikasi sesuai PRD 6.9. Jenisnya
tujuh — stok rendah, PO menunggu persetujuan, PO disetujui, PO ditolak, utang jatuh
tempo, undangan diterima, dan aktivitas keamanan akun — ditambah ringkasan harian
opsional berisi pemberitahuan sejak ringkasan terakhir. Barisnya ditulis di dalam
transaksi peristiwanya (pergerakan stok, pengajuan dan keputusan PO, penerimaan
undangan, ganti kata sandi dan email, MFA, perangkat dicabut), sedangkan emailnya
diambil dari antrean `emailed_at is null` oleh penjadwal di dalam proses API, jadi
kegagalan email tidak pernah membatalkan transaksi bisnis. Penerima dihitung dari
izin, pelaku sendiri dikecualikan, dan tiap pengguna mengatur kanalnya di
`/pengaturan/notifikasi`. Halaman `/notifikasi` menampilkan daftar dengan penanda
belum dibaca, saringan belum dibaca, dan tautan ke halaman terkait; jumlah belum
dibaca muncul di bilah atas semua halaman. Notifikasi keamanan bersifat tingkat akun
sehingga terlihat dari usaha mana pun milik pengguna itu, pengingat utang memakai
ambang yang sama dengan dashboard dan mengikuti fitur utang paketnya, dan peringatan
pergantian alamat email tetap dikirim ke alamat lama di luar preferensi.

Uji asap di peramban sungguhan menemukan cacat lama di luar notifikasi: sesi
kehilangan workspace aktif setiap kali diputar ulang — setelah verifikasi dua langkah
dan setelah ganti kata sandi — sehingga pengguna yang usahanya sudah ada disuruh
membuat usaha baru. `issueSession` sekarang menulis `active_workspace_id`, dan
putaran ulang ganti kata sandi membawa status MFA sesi sebelumnya. Keduanya
disertai tes regresi.

Verifikasi Fase 10 lulus: `npm run verify` (428 tes lulus, 8 dilewati),
`npm run test:contrast` (35 pasangan lolos), `npm run test:postgres:local` (9 lulus,
1 dilewati), build produksi, `npm run test:e2e` (182 lulus di ponsel dan desktop),
dan uji asap peramban sungguhan untuk alur notifikasi (daftar, penanda belum dibaca,
tandai semua dibaca, dan pengaturan tersimpan setelah muat ulang). Yang belum:
email masih dikirim ke penyedia log, bukan penyedia sungguhan (PRD 15), dan antrean
email masih dikuras penjadwal di dalam proses API karena pg-boss (K-02) belum
dipasang.

Fase 11 menambahkan penagihan dan faktur PDF sesuai PRD 6.10. Pemilik memilih paket dan
masa pembayaran (bulanan, atau tahunan dengan harga sepuluh bulan) di
`/pengaturan/paket`; server menulis baris tagihan bernomor `INV-<tahun>-<urut>` lebih
dulu, baru meminta tautan pembayaran Midtrans, sehingga tautan yang dipegang pengguna
selalu punya baris yang bisa ditelusuri. Pelunasan hanya dipercaya dari notifikasi
Midtrans yang ditandatangani SHA-512 dengan kunci server; nominalnya diperiksa ulang
terhadap tagihan, tagihan yang sudah lunas tidak diperpanjang dua kali, dan tagihan yang
lewat batas 24 jam ditutup tugas harian. Masa berbayar menumpuk dari ujung masa berjalan,
jadi memperpanjang lebih awal atau berganti paket di tengah masa tidak menghanguskan sisa
waktunya, dan setelah masa itu lewat tanpa pembayaran workspace kembali ke Gratis tanpa
kehilangan data. Riwayat pembayaran dan faktur PDF, memuat identitas penjual dan pembeli,
nomor, paket, masa, metode, tanggal pelunasan, dan nominal yang ditagih, hanya tersedia
untuk Owner; fakturnya tidak memuat baris pajak karena perlakuan pajak langganan masih
menunggu keputusan. Pengingat perpanjangan dikirim ke Owner tujuh hari dan satu hari
sebelum jatuh tempo, sekali untuk tiap tenggat.

Pembayaran tetap mati sampai `MIDTRANS_SERVER_KEY`, nama, alamat, dan email penjual,
serta `BILLING_REFUND_POLICY_URL` diisi lewat environment (K-21). Selama itu kosong,
tombol bayar tidak muncul, uji coba 14 hari tetap tersedia, dan halaman paket menjelaskan
keadaannya. Untuk pemeriksaan manual tanpa kunci Midtrans, `npx tsx scripts/dev-api.mts`
menyalakan gateway simulasi; nilainya diabaikan di produksi.

Verifikasi Fase 11 lulus: `npm run verify` (447 tes lulus, 8 dilewati), `npm run
test:contrast` (35 pasangan lolos), `npm run test:postgres:local` (9 lulus, 1 dilewati),
build produksi, `npm run test:e2e` (182 lulus di ponsel dan desktop), dan uji asap
peramban sungguhan untuk alur penagihan: checkout, notifikasi pembayaran bertanda tangan,
status menjadi lunas, dan faktur PDF terunduh. Yang belum: pembayaran sungguhan Midtrans
belum pernah dijalankan karena kunci sandbox dan produksi belum tersedia, jadi butir uji
pembayaran pada PRD 17 masih tertahan bersama butir lain di bagian 8
`docs/KEPUTUSAN-TEKNIS.md`.

Penjualan memakai `recordMovement` yang sama dengan stok keluar, jadi penjualan yang
menyentuh barang terakhir menghasilkan satu transaksi berhasil dan satu penolakan,
sama seperti entri stok manual. Harga pokok disimpan sebagai snapshot di setiap baris
penjualan (A-07), jadi laba kotor bulan lalu tidak berubah karena ada pembelian baru.

Halaman `/po/<token>` adalah tampilan publik purchase order. Halamannya tidak punya
sesi, tidak boleh diindeks mesin pencari, dan hanya bisa dibuka selama tautannya
berlaku.

## Situs publik

Seluruh halaman publik PRD 5 kini berdiri: beranda (`/`), daftar fitur (`/fitur`)
plus satu halaman per modul (`/fitur/stok` sampai `/fitur/langganan`), untuk usaha
F&B dan retail (`/untuk-usaha`), harga (`/harga`), pusat bantuan (`/bantuan`),
tentang (`/tentang`), status layanan (`/status`), kontak (`/kontak`), dan dokumen
kebijakan (`/kebijakan/privasi`, `/syarat`, `/refund`). Semuanya halaman statis tanpa
sesi. Header, kaki situs, dan tabel paket dipakai bersama lewat
`apps/web/src/app/components/situs.tsx`; tautan navigasi/kaki serta metadata ada di
`apps/web/src/lib/situs.ts`; isi tiap halaman ada di pustakanya masing-masing
(`lib/beranda.ts`, `lib/fitur.ts`, `lib/harga.ts`, `lib/untuk-usaha.ts`,
`lib/bantuan.ts`, `lib/tentang.ts`, `lib/status.ts`, `lib/kontak.ts`,
`lib/kebijakan.ts`) supaya bisa diuji (K-22 dan K-23). Tabel paketnya membaca katalog
`@sahabat/shared`, jadi harganya tidak bisa meleset dari halaman paket di aplikasi,
dan halaman harga menyebut angkanya masih usulan awal (PRD 16). Dokumen kebijakan
dipasang sebagai draf berlabel "Draf, belum berlaku" sampai peninjauan penasihat
hukum selesai, dan isi drafnya hanya menyatakan perilaku yang bisa diverifikasi di
kode (K-23).

Tangkapan layarnya adalah potret aplikasi sungguhan dengan data contoh di
workspace "Kedai Kopi Contoh" (K-07), diambil ulang kapan saja dengan:

```bash
npx tsx scripts/dev-api.mts 2>&1 | Tee-Object -FilePath .tmp/dev-api.log
npm run build && npm run start --workspace apps/web
npx tsx scripts/beranda-gambar.mts
```

Skrip itu mendaftarkan pengguna contoh, memverifikasi email dari log API, menyalakan
uji coba Paket Usaha, mengisi stok, dua purchase order (satu diterima penuh, satu
menunggu persetujuan), enam penjualan, dan pengeluaran, lalu memotret tujuh halaman
ke `apps/web/public/beranda`: dashboard, stok, purchase order, penjualan,
pengeluaran, laporan, dan halaman paket. Data contohnya disiapkan lewat API yang sama
dengan aplikasi, bukan lewat SQL langsung, supaya gambarnya tidak bisa menampilkan
keadaan yang tidak mungkin dibuat pengguna.

Sesuai PRD 5, halaman dipasang di navigasi hanya setelah isinya selesai, dan
navigasi kini menautkan halaman sungguhan. Tombol "Lihat Demo Produk" tetap menunggu
workspace contoh (B-13), jadi tombol hero kedua menunjuk halaman Harga. Jawaban
pertanyaan umum menyatakan keadaan sekarang: catatan stok bisa masuk antrean offline,
modul lain masih butuh koneksi, dan aplikasi ini bukan pengganti akuntansi. Halaman
Status menyebut pemantauan otomatisnya belum terpasang (PRD 14).

Verifikasi Fase 12 (situs publik penuh) lulus: `npm run verify` (473 tes lulus,
8 dilewati), `npm run test:contrast` (35 pasangan lolos), `npm run
test:postgres:local` (9 lulus, 1 dilewati), build produksi, dan `npm run test:e2e`
(248 lulus, termasuk audit aksesibilitas axe untuk seluruh halaman publik baru di
ponsel dan desktop).

## PWA dan perangkat offline (Fase 13)

PRD 10 dan PRD 12 tamat di fase ini. PWA dapat dipasang: manifest di
`apps/web/public/manifest.webmanifest` memakai warna token PRD 10, ikonnya lima PNG
yang dihasilkan `npx tsx scripts/ikon-pwa.mts` tanpa pustaka gambar (lambang tiga
batangnya sementara sampai merek resmi ditetapkan), dan service worker
`apps/web/public/sw.js` memakai jaringan dulu untuk navigasi dengan salinan hanya
sebagai penyelamat; halaman yang belum pernah dibuka jatuh ke `offline.html`, dan API
pada asal lain tidak pernah disangga sehingga angka tidak pernah disajikan dari
salinan (K-24).

Antrean offline catatan stok berdiri di `apps/web/src/lib/offline.ts`: isian Catat
stok yang gagal karena jaringan masuk antrean dengan status yang terlihat (menunggu
atau gagal beserta alasan server), kunci idempotensinya ikut tersimpan sehingga
kirim ulang tidak menggandakan stok, dan salinan daftar barang/lokasi berlabel waktu
agar halaman yang sudah dibuka tetap terpakai (K-25). Modul lain masih butuh koneksi
dan teks publiknya menyatakan itu.

Daftar periksa aktivasi (PRD 12, K-26) dihitung server di `apps/api/src/onboarding`
dari data nyata, lewatannya disimpan di tabel `workspace_onboarding_skips`
(migrasi 0013), hanya Owner dan Admin yang boleh melompati, dan kartunya hilang
saat semua langkah selesai. Panduan singkat per modul tampil saat halaman modul
pertama dibuka (`apps/web/src/lib/panduan-modul.ts`, panel dari AppShell) dan teks
yang sama bisa dibaca ulang di Lainnya.

Verifikasi Fase 13 lulus: `npm run verify` (506 tes lulus, 8 dilewati),
`npm run test:contrast` (35 pasangan lolos), `npm run test:postgres:local`
(9 lulus, 1 dilewati), build produksi, dan `npm run test:e2e` (254 lulus, termasuk
dua spesifikasi baru: alur antrean offline dari formulir sampai konfirmasi server,
serta hidupnya manifest, ikon, pendaftaran service worker, dan buka ulang halaman
tanpa sinyal di ponsel dan desktop).

Modul stok memakai satu jalur pencatatan, `recordMovement` di
`apps/api/src/stock/movements.ts`. Tidak ada endpoint lain yang boleh menulis ke
`stock_movements` atau `stock_balances`, dan penerimaan barang pada modul pembelian
ikut memakainya, jadi stok yang masuk dari PO dan stok yang dicatat manual melewati
mekanisme penguncian yang sama.

## Aturan yang berlaku di semua fase

Ringkasan lengkap ada di `docs/KEPUTUSAN-TEKNIS.md` bagian 9. Ringkasnya:

- Ledger stok tidak dapat diubah atau dihapus. Koreksi selalu baris baru.
- Saldo diperbarui dalam satu transaksi database yang sama dengan ledger.
- Stok negatif ditolak. Transaksi gagal tidak mengubah saldo.
- Penerimaan, pembayaran, dan impor memakai kunci idempotency.
- Setiap endpoint dibatasi ke workspace dan memeriksa izin di server.
- Tes akses lintas workspace berjalan di setiap build.
- Teks antarmuka memakai Bahasa Indonesia dengan sapaan "Anda".
- Tidak ada secret di repositori.
- Tidak ada klaim, angka, atau testimoni yang tidak dapat diverifikasi.

Aturan kerja untuk agen pengodings ada di `AGENTS.md`, termasuk penunjuk aturan antislop.
