# Catatan Arsitektur

Menjelaskan keputusan yang sudah dijalankan di Fase 0. Untuk keputusan yang masih
usulan dan belum dikunci, lihat `docs/KEPUTUSAN-TEKNIS.md`.

## Paket workspace

Migrasi `0009_subscriptions.sql` membuat langganan Gratis otomatis saat workspace
baru dibuat, sekaligus mengisi workspace yang sudah ada. `apps/api/src/plans/service.ts`
menyimpan aturan paket dan mengambil kunci baris workspace sebelum memeriksa kuota
atau fitur, sehingga pergantian paket dan penambahan pemakaian tidak saling mendahului.
Masa uji coba yang kedaluwarsa diturunkan saat paket dibaca atau operasi berfitur
dijalankan. Pembayaran produksi hanya menyala kalau konfigurasi penjual dan kebijakan
refund diisi (K-21); harga di katalog masih usulan PRD. Fase 6 telah diverifikasi dengan
lint, typecheck, 352 tes unit/integrasi, tes PostgreSQL lokal, pemeriksaan kontras, build
produksi, dan 128 tes E2E. Detail hasil dan batasan billing dicatat di `README.md`.

## Laporan dan ekspor

`apps/api/src/reports/service.ts` membangun sembilan laporan dari tabel bisnis, dengan
workspace dan izin per laporan diperiksa oleh `apps/api/src/reports/routes.ts`. CSV
dan XLSX memakai hasil query dan filter yang sama; paket Gratis mendapat CSV, sedangkan
ekspor XLSX melewati pemeriksaan fitur paket Usaha. Halaman `apps/web/src/app/laporan`
menampilkan definisi metrik, filter yang sesuai laporan, tampilan cetak, serta keadaan
memuat, kosong, dan galat.

Ekspor seluruh data workspace (K-17) ada di `apps/api/src/export`. Satu permintaan
`GET /api/workspaces/:id/exports/workspace` merakit CSV per tabel bisnis, membungkusnya
menjadi ZIP dengan penulis sendiri di `apps/api/src/export/zip.ts`, dan mengembalikannya
sebagai unduhan. Alasan tidak memakai pustaka ZIP pihak ketiga: yang dibutuhkan hanya
metode deflate dari zlib bawaan Node dan CRC32, jadi tidak ada satu dependensi lagi yang
harus dipercaya untuk berkas berisi data bisnis. Ekspor tersedia di semua paket, hanya
untuk Owner dan Admin, dan setiap permintaan dicatat di audit log. Selama volume masih
muat di satu permintaan, ekspor berjalan langsung; memindahkannya ke antrean dan
penyimpanan objek adalah langkah berikutnya bila volume atau kebutuhan ekspor terjadwal
datang.

## Dashboard

`apps/api/src/dashboard/service.ts` membangun seluruh isi dashboard (PRD 6.7) dalam satu
permintaan `GET /api/workspaces/:id/dashboard`: kartu ringkasan, tren harian, distribusi
status stok, dan daftar tindakan. Satu permintaan dipilih supaya semua bagian memakai
periode dan lokasi yang sama, bukan angka dari lima panggilan yang selesai pada waktu
berbeda. Periodenya dihitung di zona waktu workspace, dengan bawaan awal bulan sampai
hari ini.

Izin per bagian mengikuti izin laporan (K-18), jadi tidak ada matriks izin kedua yang
harus dijaga tetap sama. Daftar utang membaca `createReport(..., 'debts')` yang sama
dengan halaman laporan, supaya angka di dashboard dan di laporan tidak pernah berbeda.
Distribusi status stok memakai `deriveStockStatus` dari `packages/shared`, aturan yang
sama dengan lencana status di daftar barang (B-08).

Halaman `apps/web/src/app/dashboard` menampilkan bilah CSS dan baris proporsi, bukan
pustaka grafik; setiap grafik punya ringkasan teks dan tabel data yang bisa dibuka.
Workspace tanpa catatan menampilkan penjelasan dan tombol langkah berikutnya, tanpa
angka contoh (K-07).

## Notifikasi

Notifikasi PRD 6.9 memakai antrean di database, bukan pengiriman langsung dari
transaksi bisnis. Baris `notifications` ditulis di dalam transaksi peristiwanya
(pergerakan stok, pengajuan dan keputusan PO, penerimaan undangan, aktivitas akun),
jadi tidak pernah ada surat untuk transaksi yang batal. Emailnya baru diambil oleh
`flushNotificationEmails` setelah transaksi selesai: baris dengan `emailed_at is
null` diklaim lewat `update ... where emailed_at is null`, sehingga dua pengirim
bersamaan tidak mengirim pesan yang sama dua kali, dan klaimnya dilepas lagi bila
pengiriman gagal. Kegagalan email karena itu tidak pernah membatalkan pencatatan
stok atau pembelian.

Penerima dihitung dari izin (`capability`), bukan dari daftar nama: stok rendah ke
pemegang `purchase_orders.create`, utang jatuh tempo ke pemegang `reports.debt`, PO
menunggu persetujuan ke pemegang `purchase_orders.approve`. Aturan itu ada di
`apps/api/src/notifications/hooks.ts`, dan pelaku sendiri dikecualikan supaya tidak
memberi tahu orang yang baru melakukan tindakannya. Preferensi pengguna di
`notification_preferences` hanya mematikan kanal, tidak bisa menambah penerima.
Notifikasi keamanan akun disimpan dengan `workspace_id` kosong supaya tetap terlihat
dari usaha mana pun milik pengguna itu (K-20).

`apps/api/src/notifications/daily.ts` menjalankan dua tugas berkala: pengingat
utang jatuh tempo (memakai laporan `debts` yang sama dengan dashboard) dan ringkasan
harian opsional. Penjadwalnya berjalan di dalam proses API lewat
`startNotificationScheduler`, dengan `setInterval` satu jam dan pengirim email setiap
15 detik; keduanya idempoten dan dijalankan sekali di awal agar antrean yang menunggu
saat server dinyalakan tidak menunggu satu putaran. Ketika pg-boss dipasang (K-02),
isi dua tugas ini yang dipindahkan menjadi job, bukan ditulis ulang.

Halaman `/notifikasi` menampilkan daftar dengan penanda belum dibaca dan tautan ke
halaman terkait; jumlah belum dibaca muncul di bilah atas semua halaman lewat
`app-context`. Pengaturan per jenis dan ringkasan harian ada di
`/pengaturan/notifikasi`. Keduanya memanggil endpoint yang memeriksa sesi dan
keanggotaan workspace di server, bukan hanya menyembunyikan tombol.

## Penagihan langganan

Penagihan PRD 6.10 ada di `apps/api/src/plans/` (`billing.ts`, `billing-service.ts`,
`invoice-pdf.ts`, `routes.ts`) dengan tabel `payments` dari migrasi
`0012_billing.sql`. Satu checkout menulis baris tagihan beserta nomor
`INV-<tahun>-<urut>` dari sequence global `payment_numbers`, baru kemudian meminta
tautan pembayaran Midtrans lewat `apps/api/src/services/payment-gateway.ts`. Urutan itu
penting: tautan yang sudah dipegang pengguna selalu punya baris yang bisa ditelusuri.
Panggilan jaringan tidak pernah berada di dalam transaksi database, dan kegagalannya
menandai tagihan `gagal`, bukan menggantung transaksi. Nomor faktur memakai sequence
global, bukan `document_sequences` per workspace, karena faktur diterbitkan penjual
untuk semua pelanggan.

Pelunasan hanya dipercaya dari notifikasi
`POST /api/payments/midtrans/notification` yang ditandatangani SHA-512 dengan kunci
server. Nominalnya diperiksa ulang terhadap baris tagihan sebelum melunasi, dan baris
yang sudah `dibayar` tidak diproses dua kali, jadi notifikasi yang datang berulang aman.
Masa berbayar menumpuk dari ujung masa berjalan, jadi memperpanjang lebih awal atau
berganti paket di tengah masa tidak menghanguskan sisa waktunya. Masa berbayar yang
lewat dan uji coba yang berakhir sama-sama ditangani `effectivePlan`, jalur yang sama
seperti Fase 6, tanpa menghapus data usaha.

`invoice-pdf.ts` memakai pola pdfkit yang sama dengan PO (K-15): hanya data yang benar
tercatat, identitas penjual dari environment, dan tanpa baris pajak karena perlakuan
pajak langganan belum ditetapkan. Riwayat pembayaran dan faktur hanya untuk Owner lewat
izin `subscription.manage`. Pembayaran hanya menyala kalau `MIDTRANS_SERVER_KEY`,
identitas penjual, dan `BILLING_REFUND_POLICY_URL` terisi; `PAYMENT_SIMULATION=1`
menyediakan gateway tanpa jaringan untuk pengembangan dan diabaikan di produksi.

Pengingat perpanjangan tujuh hari dan satu hari dijalankan tugas harian
`apps/api/src/notifications/daily.ts` bersama penutupan tagihan yang lewat batas
24 jam. Cap waktunya disimpan per masa di `workspace_subscriptions`, jadi satu tenggat
hanya menghasilkan satu surat, dan masa baru mengosongkannya lagi.

## Situs publik

Beranda (`/`) adalah halaman statis tanpa sesi di `apps/web/src/app/page.tsx`, dengan
seluruh teks dan daftar isinya di `apps/web/src/lib/beranda.ts` supaya bisa diuji
(K-22): tautannya hanya menuju halaman atau bagian yang ada, harganya dibaca dari
katalog `@sahabat/shared` yang sama dengan aplikasi, dan pertanyaan umumnya hanya
menyatakan yang sudah berdiri di kode. Data terstruktur (`Organization`, `WebSite`,
`SoftwareApplication` dengan `offers` per paket), `robots.txt`, dan `sitemap.xml`
membaca `NEXT_PUBLIC_SITE_URL` untuk URL
kanoniknya. Tangkapan layar di `apps/web/public/beranda` adalah potret aplikasi
dengan data contoh (K-07), diambil ulang lewat `npx tsx scripts/beranda-gambar.mts`
dengan API dev di :4000 dan build produksi di :3000. Halaman publik lainnya dari
PRD 11 dan 15 menyusul pada Fase 12 dan hanya dipasang di menu setelah isinya siap
(PRD 5).

## Bentuk sistem

Modular monolith, sesuai PRD 13. Dua proses yang berjalan terpisah:

| Proses | Peran |
| --- | --- |
| `apps/web` | Frontend. Situs publik dirender di server untuk LCP 2,5 detik, area aplikasi menjadi PWA. |
| `apps/api` | API. Satu proses Fastify, modular per domain. |

Basis data PostgreSQL accessed langsung oleh API. Antrean tugas (impor, ekspor,
email) direncanakan berjalan di atas PostgreSQL dengan pg-boss agar tidak ada
layanan tambahan yang harus dipantau dan dicadangkan; pada fase ini impor dan
ekspor masih dijalankan langsung saat permintaan datang karena volumenya belum
menuntut antrean. Email notifikasi sudah memakai antrean di database yang dikuras
oleh penjadwal dalam proses (`apps/api/src/notifications`), lihat bagian Notifikasi.

## Mengapa tanpa ORM

PRD 13 mewajibkan saldo diperbarui dalam satu transaksi database yang sama dengan
baris ledger, dan penguncian tingkat baris untuk mencegah stok negatif. Keduanya
lebih mudah dibuktikan dan ditinjau kalau kueri yang menentukan saldo terlihat
apa adanya di kode, bukan diterjemahkan dari objek.

Konsekuensinya setiap modul menulis SQL-nya sendiri. Semua kueri memakai parameter
$1, $2, dan tidak ada kueri yang dirangkai dari teks (PRD 9).

## Isolasi workspace di level database

PRD 9 meminta relasi lintas workspace dicegah oleh constraint database, bukan hanya
oleh pemeriksaan di aplikasi. Pola yang dipakai:

1. Setiap tabel terikat workspace punya kolom `workspace_id` dan batasan unik
   `(id, workspace_id)`.
2. Tabel turunan mereferensikan `(parent_id, workspace_id)`, bukan hanya `parent_id`.
3. Foreign key komposit itu membuat referensi ke objek workspace lain mustahil terjadi,
   karena pasangan id dan workspace id harus cocok di kedua sisi.

Pola yang sama wajib berlaku pada setiap tabel terikat workspace berikutnya, dan
tes otomatis harus mencoba membaca objek milik workspace lain lalu gagal (PRD 9, 17).

## Larangan mengubah riwayat

PRD 6.2 dan 13 menyatakan riwayat tidak dapat diubah atau dihapus. Migrasi 0001
membuat trigger yang menolak UPDATE dan DELETE pada `audit_logs` dan menyediakan
fungsi `reject_row_mutation()` untuk tabel lain yang butuh aturan sama. Migrasi
0003 menerapkannya pada `stock_movements`, jadi koreksi stok selalu menjadi baris
baru.

## Ledger stok

Migrasi 0003 membuat `stock_movements` sebagai satu-satunya jalan masuk perubahan
stok. Tiga aturan membuatnya tidak bisa disalahgunakan:

1. Tiap baris menyimpan `direction` ('tambah' atau 'kurang') dan `quantity` yang
   selalu positif. Arah tidak ditebak dari jenis gerak, karena selisih opname bisa
   naik atau turun dan kueri penjumlahan saldo harus bisa membacanya tanpa
   menebak.
2. Tiap baris menyimpan `balance_before` dan `balance_after`, jadi penelusuran
   saldo tidak perlu menghitung ulang seluruh riwayat.
3. Trigger menolak UPDATE dan DELETE.

Saldo disimpan di `stock_balances`, bukan dihitung dari penjumlahan ledger saat
dibaca. Pembaruan saldo, baris ledger, lot, dan rata-rata bergerak terjadi di satu
transaksi yang sama. Baris saldo dikunci dengan `select ... for update`, dan baris
dibuat lebih dulu kalau belum ada, karena `for update` tidak mengunci baris yang
belum ada.

`stock_lots` menyimpan tanggal kedaluwarsa per penerimaan. A-05 menetapkan 1.0 tidak
mengalokasikan FEFO: barang keluar diambil dari lot terlama lebih dulu, dan tanggal
yang ditampilkan adalah yang paling awal dari lot yang masih bersaldo. Lot yang
sudah habis tidak dipakai untuk peringatan kedaluwarsa.

Fungsi `recordMovement` di `apps/api/src/stock/movements.ts` adalah satu-satunya
pembuat baris ledger. Modul lain tidak boleh menulis langsung ke
`stock_movements` atau `stock_balances`. Modul pembelian memakainya juga untuk
penerimaan barang, retur, dan penyesuaian hasil stok opname, sehingga barang yang
masuk dari purchase order dan barang yang dicatat manual melewati penguncian yang
sama.

## Nomor dokumen

Nomor purchase order, penerimaan, retur, dan pembayaran diambil dari tabel
`document_sequences` yang kuncinya `(workspace_id, kind, year)`. Sequence bawaan
PostgreSQL tidak dipakai: sequence bersifat global, jadi dua workspace saling
mengambil nomor dan nomor per tahun tidak bisa diketahui tanpa menghitung ulang dari
nol. Baris urutan dikunci saat nomor diambil supaya dua dokumen yang dibuat bersamaan
tidak mendapat nomor sama.

## Pembagian purchase order

Tautan baca-saja dibaca lewat `purchase_order_shares`, yang hanya menyimpan SHA-256
tokennya. Isi tabel yang bocor karena itu tidak cukup untuk membuka tautan mana pun.

Dua jalur, dan keduanya lewat modul yang sama:

- `GET /api/public/purchase-orders/:token` dilayani tanpa sesi. Token yang dicabut,
  kedaluwarsa, dan tidak ada sama-sama mendapat jawaban yang sama, supaya jawabannya
  tidak memberi petunjuk apakah token itu pernah ada.
- `GET /api/workspaces/:workspaceId/purchase-orders/:orderId/pdf` dilayani untuk
  anggota workspace.

Halaman web `/po/<token>` diambil di server dengan `cache: 'no-store'` dan
`metadata.robots` berisi `noindex`, sesuai A-11.

## Pengeluaran dan lampiran

Pengeluaran dan kategorinya terikat workspace. Foreign key komposit memastikan
kategori, purchase order opsional, dan lampiran tidak bisa menunjuk ke workspace
lain. Satu PO hanya boleh ditautkan ke satu pengeluaran, dengan indeks unik di
database sebagai perlindungan akhir dari pencatatan ganda.

Catatan pengeluaran dan lampiran bersifat append-only. Lampiran dibatasi jumlah dan
ukuran, jenisnya diperiksa dari byte berkas, dan unduhan memerlukan izin workspace.
Nama berkas pengguna hanya disimpan untuk tampilan, tidak dipakai sebagai kunci
penyimpanan.

## Uang dan waktu

- Uang adalah `BIGINT` rupiah penuh tanpa pecahan, pembulatan setengah ke atas per
  nilai akhir. Lihat `KEPUTUSAN-TEKNIS.md` bagian 3.
- Jumlah barang dan harga pokok bergerak adalah `numeric(18,4)`, karena keduanya
  boleh pecahan. Lihat `KEPUTUSAN-TEKNIS.md` bagian 1, K-12.
- Waktu disimpan sebagai `timestamptz` dalam UTC.
- Tanggal kalender dan periode laporan dihitung menurut zona waktu workspace, supaya
  "hari" pada laporan sama dengan hari yang dilihat pengguna. Fungsi
  `toDateParts` di `packages/shared` melakukan penerjemahan itu.

## Strategi pengujian

`npm test` berjalan tanpa Docker dan tanpa server database, memakai PGlite, yaitu
PostgreSQL asli yang dikompilasi untuk WebAssembly. Trigger, batasan CHECK,
transaksi, rollback, dan `SELECT FOR UPDATE` semuanya berperilaku sama dengan
PostgreSQL, jadi integritas stok dapat diuji di setiap build.

Batasnya: PGlite memakai satu koneksi, jadi ia tidak dapat menguji dua koneksi
berjalan bersamaan. Kriteria PRD 6.2 yang menuntut dua pengguna mengeluarkan stok
terakhir pada saat bersamaan hanya bisa diuji terhadap PostgreSQL sungguhan. Tes itu
berada di proyek `postgres` dan dijalankan lewat:
```bash
TEST_DATABASE_URL=postgres://sahabat:sahabat@127.0.0.1:5432/sahabat_umkm npm run test:postgres
```

Berkas `packages/db/test-postgres/stock-concurrency.test.ts` menguji alur lengkapnya:
dua transaksi memanggil `recordMovement` untuk produk, lokasi, dan stok yang sama.
Yang diperiksa bukan hanya penguncian tingkat baris, tetapi juga bahwa:
satu berhasil satu ditolak saat stok terakhir diambil bersamaan, lima permintaan
perebut dua barang menghasilkan tepat dua transaksi berhasil, pesan penolakan menyebut
produk dan lokasi, dan saldo akhir selalu sama dengan penjumlahan ledger.

Statusnya per 10 Oktober 2026: tes ini sudah dijalankan dan lulus terhadap
PostgreSQL sungguhan lewat `npm run test:postgres:local`, yang menyalakan klaster
PostgreSQL tertanam tanpa Docker. Hasilnya 6 tes lulus. Jalankan juga di CI pada job
`postgres-concurrency`.

Ketika tes ini pertama kali dijalankan, terungkap bahwa berkas penguncian yang lama
tidak pernah dijalankan sejak fase 0 dan salah: ia membuka transaksi kedua di dalam
transaksi pertama yang masih memegang kunci, sehingga mengunci dirinya sendiri dan
selalu berakhir dengan batas waktu. Tesnya ditulis ulang memakai dua instance
Database yang benar-benar berbeda.

## Konfigurasi

Semua nilai rahasia dibaca dari environment. `.env.example` hanya berisi placeholder
dan tidak pernah berisi nilai nyata. Pratinjau konfigurasi ada di `README.md` dan
`.env.example`.
