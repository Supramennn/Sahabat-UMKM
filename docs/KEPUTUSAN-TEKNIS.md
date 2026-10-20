# Catatan Keputusan Teknis Sahabat UMKM

Status: aktif. Sumber kebenaran produk tetap `docs/PRD-Sahabat-UMKM.md`. Dokumen ini mencatat
keputusan yang PRD delegasikan ke tim, beserta alasannya, supaya setiap fase bisa merujuk
nomor yang sama.

Terakhir diperbarui: 19 Oktober 2026.

## 1. Keputusan yang sudah dikunci

| No | Keputusan | Nilai | Dasar |
| --- | --- | --- | --- |
| K-01 | Nama PRD | `docs/PRD-Sahabat-UMKM.md` | Persetujuan pemilik produk, 9 Okt 2026 |
| K-02 | Stack | Next.js 15 (App Router) + TypeScript + Tailwind, Fastify + TypeScript + Zod, PostgreSQL 16, pg-boss, S3 kompatibel | PRD 13 |
| K-03 | Pengujian | Vitest, Playwright, Testing Library, axe-core | PRD 17 |
| K-04 | Hosting | Belum dikunci. Pengembangan memakai Docker Compose lokal, plus dokumen deploy. Kunci setelah alur stok dan penerimaan terbukti, sesuai PRD 20 | PRD 13, PRD 20 |
| K-05 | Payment gateway | Midtrans | PRD 6.10, PRD 20 |
| K-06 | Cara pakai antislop | Applied selama pengerjaan (Mode 1), bukan audit setelah selesai | Persetujuan pemilik produk |
| K-07 | Data contoh | Angka contoh hanya boleh tampil dengan label "data contoh" yang terlihat. Tidak ada testimoni, jumlah pengguna, logo pelanggan, atau klaim tanpa bukti | PRD 11 |
| K-08 | Sifat butir di bagian 7 | Semua butir A-01 sampai A-11 dan B-01 sampai B-13 disetujui pemilik produk dan menjadi nilai tetap, bukan lagi usulan | Persetujuan pemilik produk, 9 Okt 2026 |
| K-09 | Cakupan UI Fase 1 | Seluruh halaman autentikasi plus halaman pengaturan akun. Pemilih workspace belum termasuk Fase 1 | Persetujuan pemilik produk, 9 Okt 2026 |
| K-10 | MFA | Dibangun pada Fase 1, bukan ditunda ke Fase 8 | Persetujuan pemilik produk, 9 Okt 2026 |
| K-11 | PostgreSQL dan CI | Menyiapkan PostgreSQL sungguhan untuk mesin ini dan CI untuk menjalankan tes konkurensi | Persetujuan pemilik produk, 9 Okt 2026 |
| K-12 | Bentuk angka jumlah dan harga pokok | Jumlah barang `numeric(18,4)` dalam satuan, bukan rupiah penuh. Rata-rata bergerak disimpan `numeric(18,4)` dan nilai persediaan dibulatkan ke rupiah penuh per nilai akhir | PRD 6.2, PRD 7 |
| K-13 | Pemisahan izin penyesuaian stok | `stock.adjustments` dipisah dari `stock.movements`. Staf boleh mencatat barang masuk dan keluar, tetapi penyesuaian dan persetujuan hasil opname hanya untuk Owner dan Admin | PRD 8 |
| K-14 | Pembagian purchase order | Token acak 32 byte, hanya hash-nya yang disimpan. Masa berlaku bawaan 30 hari dan bisa diubah Owner lewat parameter, dibatasi 1 sampai 365 hari. Tautan dicabut otomatis saat dibuatkan yang baru, jadi selalu ada tepat satu alamat hidup per PO | PRD 6.3, A-11 |
| K-15 | PDF purchase order | pdfkit dengan font bawaan Helvetica. Huruf di luar WinAnsi diganti tanda tanya, bukan mencari font, supaya berkas selalu bisa dibuat dan tidak bergantung pada font yang ada di server | PRD 6.3 |
| K-16 | Gaya frontend | CSS Modules di atas token warna PRD 10, bukan Tailwind. Token warna sudah dipakai di seluruh komponen dan sudah lolos `npm run test:contrast`. Memindahkan 20 halaman ke Tailwind adalah pekerjaan besar yang tidak menambah kemampuan produk, dan berisiko menurunkan kontras yang sekarang sudah terverifikasi. Dicabut pada 17 Okt 2026 oleh K-19 | PRD 10, PRD 17 |
| K-17 | Bentuk ekspor seluruh data | Satu arsip ZIP berisi satu CSV per tabel bisnis plus PANDUAN.txt, diunduh Owner atau Admin kapan saja, tersedia di semua paket, dan dijalankan langsung pada permintaan (belum lewat antrean). Berkas lampiran biner, riwayat impor, log audit, dan data teknis tidak ikut | PRD 6.8, PRD 16 |
| K-18 | Isi dan akses dashboard | Setiap bagian dashboard memakai izin laporan yang sama dengan halaman laporan, jadi peran yang tidak boleh membaca laporan pembelian atau utang juga tidak menerimanya di dashboard. Grafik dibuat dari elemen dasar tanpa pustaka grafik, selalu disertai ringkasan teks dan tabel data yang bisa dibuka. Navigasi bawah ponsel memakai lima tujuan PRD 10 termasuk halaman Lainnya | PRD 6.7, PRD 8, PRD 10 |
| K-19 | Gaya frontend | Tailwind CSS v4 dan Motion (Framer Motion) untuk seluruh antarmuka, menggantikan K-16. Nilai warna tetap hanya dari `packages/design-tokens`; blok `@theme` di `apps/web/src/styles/globals.css` wajib sama persis dan dijaga tes `theme-sync`. Gerak dibatasi pada animasi transformasi masuk yang terukur dan menghormati `prefers-reduced-motion` | Permintaan pemilik produk, 17 Okt 2026; PRD 13 |
| K-20 | Notifikasi dan email | Baris notifikasi ditulis di dalam transaksi peristiwanya; email diambil dari antrean `emailed_at is null` oleh penjadwal dalam proses, tidak pernah dikirim dari dalam transaksi. Penerima dihitung dari izin (capability), pelaku sendiri dikecualikan, dan preferensi pengguna hanya bisa mematikan kanal. Notifikasi keamanan bersifat tingkat akun (`workspace_id null`) sehingga tampil di daftar semua usaha pemiliknya. Utang jatuh tempo memakai ambang `overdueDays > 0` yang sama dengan dashboard dan hanya untuk paket dengan fitur `returns`. Ringkasan harian opt-in, dikirim setelah pukul 7 pagi waktu usaha | PRD 6.9, PRD 6.2, PRD 8, PRD 16 |
| K-21 | Penagihan langganan | Midtrans Snap lewat halaman pembayaran Midtrans, bukan Snap tertanam. Baris tagihan di-commit sebelum tautan bayar diminta, pelunasan hanya dipercaya dari notifikasi bertanda tangan, faktur PDF dibuat dengan pdfkit, masa berbayar menumpuk dari ujung masa berjalan, dan pembayaran hanya menyala kalau identitas penjual serta tautan kebijakan refund diisi lewat environment | PRD 6.10, PRD 15, PRD 16 |
| K-22 | Beranda publik | Halaman statis berkomponen server dengan seluruh isi dan teks di `apps/web/src/lib/beranda.ts` supaya bisa diuji. Tangkapan layarnya adalah potret aplikasi dengan data contoh yang diambil `scripts/beranda-gambar.mts` dan ikut di-commit. Harga dibaca dari katalog `@sahabat/shared`, bukan ditulis ulang. Navigasi hanya menautkan halaman atau bagian yang ada; tombol "Lihat Demo Produk" menunggu workspace contoh (B-13). FAQ menjawab keadaan sekarang, termasuk kebutuhan koneksi internet sampai antrean offline selesai | PRD 11, PRD 5, K-07, B-13 |
| K-23 | Situs publik lengkap | Sisa halaman publik PRD 5 dikerjakan: `/fitur` plus satu halaman per modul (`/fitur/stok`, `pembelian`, `penjualan`, `pengeluaran`, `laporan`, `langganan`), `/untuk-usaha`, `/harga`, `/bantuan`, `/tentang`, `/status`, `/kontak`, dan `/kebijakan/privasi`, `/syarat`, `/refund`. Komponen header, kaki, tombol, gambar sampel, dan tabel paket dipakai bersama di `apps/web/src/app/components/situs.tsx`; tautan navigasi/kaki dan metadata di `apps/web/src/lib/situs.ts`; isi tiap halaman di pustaka masing-masing (`lib/fitur.ts`, `lib/harga.ts`, `lib/bantuan.ts`, `lib/tentang.ts`, `lib/status.ts`, `lib/kontak.ts`, `lib/kebijakan.ts`). Halaman Status menulis "Belum dipantau otomatis" tanpa angka ketersediaan; Kontak hanya menampilkan saluran yang nyata; kebijakan dipasang sebagai draf berlabel "belum berlaku"; Harga tetap membaca katalog dengan catatan "masih usulan awal" | PRD 5, 11, 14, 15, 16 |

### Alasan K-12

Bagian 3 menetapkan uang disimpan sebagai rupiah penuh. Itu berlaku untuk nilai
yang dinyatakan dalam rupiah: harga beli, harga jual, dan nilai persediaan. Jumlah
barang tidak bisa ikut aturan itu, karena 1,5 kg atau 0,25 liter adalah satuan yang
sah, dan memaksa jumlah menjadi bilangan bulat membuat catatan timbangan tidak cocok
dengan timbangan.

Kolom jumlah memakai `numeric(18,4)`. Presisi lebih dari empat angka desimal
ditolak di server, bukan dipotong, karena selisih yang hilang diam-diam akan muncul
sebagai selisih stok opname yang tidak bisa dijelaskan.

Rata-rata bergerak per satuan bisa pecahan rupiah: tiga barang seharga Rp10.000
dengan satu barang seharga Rp11.000 menghasilkan Rp10.666,6667 per satuan. Nilai itu
disimpan penuh di `product_costs`, sedangkan nilai persediaan yang ditampilkan dan
laba kotor dibulatkan ke rupiah penuh per nilai akhir.

### Alasan K-13

PRD 8 memberi staf izin "input stok dan penjualan" dan "stok opname: hitung saja".
Tabel itu tidak membedakan barang masuk dan keluar dari penyesuaian, padahal
keduanya berbeda sifat: barang keluar adalah peristiwa nyata, penyesuaian adalah
koreksi catatan tanpa barang yang bergerak. Kalau keduanya memakai izin yang sama,
staf bisa mengoreksi saldo tanpa ada yang bertanggung jawab. Penyesuaian dan
persetujuan hasil opname karena itu memakai izin terpisah.

### Alasan K-14

A-11 menetapkan tautan baca-saja dengan token acak, masa berlaku, dan pencatatan
pembukaan. Yang belum disebut adalah tiga hal berikut, dan ketiganya diputuskan di
sini:

1. **Yang disimpan hanya hash token.** Tabel ini menyimpan cukup data sensitif untuk
   jadi sasaran. Menyimpan tokennya berarti siapa pun yang membaca isi tabel, atau
   salinan-cadangannya, bisa membuka setiap PO yang sedang dibagikan. Yang disimpan
   adalah SHA-256 tokennya, jadi isi tabel tidak cukup untuk membuka tautan apa pun.

2. **Masa berlaku 30 hari bisa diubah, tetapi dibatasi 1 sampai 365 hari.** A-11
   menyebut 30 hari dan menyebut bisa diubah Owner tanpa memberi batas atas. Tanpa
   batas atas, tautan bisa dibuat berlaku beberapa tahun dan berhenti menjadi
   expiration. Batas satu tahun masih panjang untuk dokumen yang isinya bisa
   berubah, dan masih cukup untuk supplier yang memesan jarang.

3. **Membuat tautan baru mencabut yang lama.** Kalau dua tautan bisa hidup
   bersamaan, mencabut satu tidak menutup jalur masuk yang lain, dan pemilik tidak
   bisa memastikan hanya satu alamat yang beredar. Satu tautan hidup per PO
   membuat mencabut benar-benar mencabut.

Setiap pembukaan menambah penghitung dan menyimpan alamat IP-nya, jadi pemilik bisa
melihat tautannya sudah dipakai meskipun tidak ada yang mengeluh.

### Alasan K-15

PRD 6.3 meminta PO bisa diunduh sebagai PDF tanpa menentukan caranya. Pustaka PDF
dibuat karena menulis berkas PDF dari awal berarti mengelola offset xref, kompresi
aliran, dan pengukuran lebar huruf sendiri; ketiganya salah satu saja membuat berkas
rusak tanpa pesan galat yang jelas.

Font bawaan Helvetica dipakai, bukan font dari sistem. Alasannya, isi PDF purchase
order adalah data bisnis: nomor PO, nama barang, dan rupiah. Tidak ada alasan untuk
menyematkan font di dalam berkas itu.

Konsekuensinya, huruf di luar WinAnsi tidak punya tempat. Nama barang dari impor CSV
bisa saja memuat aksara non-Latin, jadi teks dibersihkan lebih dulu: huruf di luar
WinAnsi diganti tanda tanya, karakter kontrol diganti spasi. Tanpa itu, satu nama
aneh membuat permintaan unduhan gagal seluruhnya, dan pengguna tidak pernah melihat
PO-nya.

### Alasan K-16

K-02 mencantumkan Tailwind sebagai bagian stack, dan PRD 13 menyebut Tailwind sebagai
usulan. Setelah Fase 0 sampai Fase 3, pilihan itu ditunda, lalu dicatat di sini
supaya tidak menggantung.

Alasannya bukan soal selera. Pertama, PRD 10 sudah menetapkan token warnanya sendiri dan
`scripts/check-ui-contrast.mts` memeriksa setiap pasangan warna yang dipakai komponen
itu. Dengan CSS Modules, nilai warna hanya ada di `packages/design-tokens` dan di satu
berkas gaya per modul, sehingga hasil pemeriksaan benar-benar menggambarkan apa yang
dirender. Dengan Tailwind, kelas warna bisa muncul di mana saja dalam JSX, dan
pemeriksaan kontras berhenti jadi pemeriksaan token, bukan pemeriksaan tampilan.

Kedua, pengerjaan berjalan per fase dan halaman baru lahir tiap fase. Dua sistem gaya
yang hidup berdampingan membuat setiap halaman berikutnya punya dua pilihan yang sama
salahnya, dan yang salah pilihnya tidak ketahuan sampai pemeriksaan kontras gagal.

Ketiga, migrasi penuh baru dilakukan kalau ada alasan yang terlihat oleh pengguna.
Ukuran berkas dan kecepatan render di Next.js pada kelasUtility berada di urutan yang
sama dengan CSS Modules untuk tabel dan formulir seperti yang dipakai produk ini.

Yang tetap dijaga: nama kelas, radius, spasi, dan warna hanya boleh diambil dari token
yang sama. CSS Modules di sini bukan CSS bebas per halaman.

### Alasan K-17

Ekspor penuh dikirim sebagai satu arsip ZIP berisi CSV per tabel. Unduhan tunggal
membuat pengguna tidak perlu mengumpulkan dua lusin berkas satu per satu, dan
isinya tetap CSV yang bisa dibaca spreadsheet mana pun. Yang tidak ikut adalah
lampiran foto/PDF pengeluaran (biner, bukan bentuk CSV), riwayat impor, log audit,
dan data teknis seperti sesi, kata sandi, serta token. Daftar itu disebutkan di
PANDUAN.txt di dalam arsip supaya pengguna tidak menduga-duga isinya.

Tersedia di semua paket karena PRD 16 menyebut ekspor seluruh data tidak boleh
jadi fitur berbayar. Owner dan Admin boleh mengunduhnya; Purchasing hanya menerima
ekspor laporan pembelian, sesuai izin "Pembelian saja".

Ekspornya berjalan langsung pada permintaan, bukan lewat antrean. Antrean pg-boss
belum dipasang pada fase ini, dan selama volume workspace masih muat di satu
permintaan, satu langkah lebih sedikit untuk gagal. Kalau nanti ada ekspor
terjadwal atau workspace yang datanya tidak lagi muat di satu permintaan, langkah
berikutnya adalah memindahkan pekerjaan ini ke antrean dan penyimpanan objek.

### Alasan K-18

PRD 6.7 menyebut isi dashboard, tetapi tidak menyebut siapa yang boleh melihat setiap
bagiannya. Membuat izin baru untuk dashboard berarti dua tempat yang harus dijaga tetap
sama. Dashboard karena itu meminjam izin laporan yang sudah ada (PRD 8, B-02): kartu dan
tren stok butuh `reports.stock`, penjualan butuh `reports.sales`, pembelian dan PO butuh
`reports.purchasing`, dan utang supplier butuh `reports.debt` plus paket yang memuat fitur
retur dan utang, sama seperti laporan utang. Peran Staf, yang menurut PRD 8 tidak punya
izin laporan, tetap bisa membuka halaman dan mendapat penjelasan serta tautan ke halaman
kerja yang bisa dipakainya, bukan halaman kosong atau angka yang bukan haknya.

Grafiknya dibuat dari elemen dasar, tanpa pustaka grafik: bilah CSS untuk tren harian dan
baris proporsi untuk status stok. Setiap grafik disertai ringkasan teks dan tabel data
yang bisa dibuka, jadi angkanya terbaca juga oleh pembaca layar, saat dicetak, dan saat
warnanya tidak terbedakan. Menggambar grafik sendiri lebih sedikit kode daripada menambah
dependensi yang harus ikut diuji kontras dan aksesibilitasnya.

Menu ponsel PRD 10 meminta Dashboard dan Lainnya; halaman Lainnya mengambil daftarnya dari
sumber yang sama dengan sidebar, jadi tidak ada tautan yang hanya hidup di satu tempat.

### Alasan K-19

Pemilik produk meminta antarmuka yang tidak lagi terasa datar, dengan Tailwind CSS sebagai
sistem gaya dan Framer Motion untuk animasi (17 Okt 2026). K-16 menolak Tailwind dengan tiga
alasan: nilai warna bisa tersebar, pemeriksa kontras kehilangan makna, dan migrasi besar tanpa
tambahan kemampuan produk. K-19 menjawab ketiganya, bukan mengabaikannya.

Nilai warna tetap hanya ada di `packages/design-tokens`. Tailwind membacanya lewat blok
`@theme` di `apps/web/src/styles/globals.css`, dan tes `theme-sync` di packages/design-tokens
gagal bila salinan itu menyimpang, baik nilai yang berbeda maupun warna tambahan yang tidak
ada di token. Aturan kelas warna hanya boleh berasal dari tema itu; tidak ada nilai
heksadesimal di JSX. Pemeriksa kontras tetap memeriksa pasangan yang benar-benar dipakai,
sekarang dengan nilai yang diimpor langsung dari token, bukan ditulis ulang di skrip. Lapisan
keduanya adalah axe saat E2E, yang mengukur warna yang benar-benar dirender di setiap halaman.

Pekerjaan migrasinya besar dan itu disadari: 20 berkas `*.module.css` dan 43 komponen
dipindahkan sekaligus, modul CSS dihapus setelah halamannya pindah, dan blok variabel CSS
sementara ikut dihapus di akhir. Supaya tampilan tidak berubah tanpa kendali, PRD 10 tetap
mengikat: palet yang sama, tanpa gradasi dekoratif, target sentuh 44 px, tanpa gulir
horizontal, dan semua teks tetap Bahasa Indonesia dengan sapaan "Anda".

Untuk animasi, aturannya: konten masuk memakai transformasi halus tanpa perubahan opasitas,
sehingga pemeriksaan kontras tidak pernah mengukur teks yang setengah transparan;
`MotionConfig reducedMotion="user"` mematikan animasi bagi pengguna yang memintanya; dan
suite E2E dijalankan dengan `reducedMotion` agar hasilnya deterministik.

### Alasan K-20

PRD 6.9 hanya menyebut jenis notifikasi dan dua kanalnya, jadi bentuk teknisnya
diputuskan di sini. Aturan pertama mengikuti PRD 9: email tidak boleh dikirim dari
dalam transaksi bisnis. Kalau pengiriman email dilakukan di tengah transaksi stok,
satu penyedia email yang lambat menahan kunci baris saldo, dan kegagalan email bisa
membatalkan pencatatan yang sebenarnya sah. Karena itu baris notifikasi ditulis di
dalam transaksi (supaya tidak pernah ada surat untuk transaksi yang batal), lalu
pengirim (`flushNotificationEmails`) mengambilnya setelah transaksi selesai. Klaim
lewat `update ... where emailed_at is null` membuat dua pengirim bersamaan tidak
mengirim pesan yang sama dua kali, dan klaim dilepas lagi bila pengiriman gagal.

Penerima ditentukan dari izin, bukan daftar nama: stok rendah ke pemegang
`purchase_orders.create` (Owner, Admin, Purchasing), utang ke pemegang `reports.debt`
(Owner dan Admin, sama seperti laporan), PO menunggu persetujuan ke pemegang
`purchase_orders.approve`. Pelaku sendiri dikecualikan untuk stok rendah, pengajuan
PO, keputusan PO, dan undangan diterima, karena memberi tahu orang yang baru
melakukannya hanya menambah bising. Pengaturan pengguna di halaman
`/pengaturan/notifikasi` hanya mematikan kanal in-app atau email per jenis; ia tidak
bisa menambah penerima, karena penerima adalah soal izin.

Notifikasi aktivitas keamanan (ganti kata sandi, ganti email, MFA dinyalakan atau
dimatikan, perangkat dicabut) tidak melekat pada satu usaha: `workspace_id`-nya
`null`, dan daftar notifikasi workspace mana pun milik pengguna itu menampilkannya.
Kalau baris seperti ini diikatkan ke workspace, pengguna yang sedang membuka usaha
lain tidak akan pernah melihat peringatan keamanannya. Peringatan perubahan email
juga dikirim langsung ke alamat lama, di luar preferensi, karena itu satu-satunya
kanal yang masih dipegang pemilik sah saat alamat barunya dikuasai orang lain.

Kunci dedupe menahan baris kembar dengan pola `peristiwa:id:konteks`, misalnya
`stok_rendah:{produk}:{tanggal}`, `po_diajukan:{po}`, dan
`utang_jatuh_tempo:{workspace}:{tanggal}`. Kolomnya `nullable` dengan indeks unik
parsial `(user_id, dedupe_key)`, jadi notifikasi tanpa kunci (keamanan) tetap boleh
berulang, sedangkan yang berkunci hanya muncul sekali.

Ringkasan harian adalah Opt-in (bawaan mati) karena PRD 6.9 menyebutnya opsional.
Jam kirimnya 07.00 di zona waktu usaha, dihitung dari keanggotaan terlama pengguna,
karena jam per pengguna tidak ada di PRD. Isinya hanya baris yang diminta lewat
email, dan waktunya dibatasi sejak ringkasan terakhir (atau 24 jam terakhir).

Ambang utang jatuh tempo sengaja memakai `overdueDays > 0` dan laporan `debts` yang
sama dengan dashboard, supaya angka di surel tidak pernah berbeda dari angka di
aplikasi. Laporan itu terikat fitur `returns` (PRD 16), jadi paket Gratis tidak
menerima pengingat utang — bukan karena pesan email lebih mahal, tetapi karena ia
tidak bisa membuka halaman yang disebut di pesan itu.

Penjadwal berjalan di dalam proses (`startNotificationScheduler`), bukan worker
terpisah, karena server ini belum punya pg-boss. K-02 mencatat pg-boss untuk antrean
impor, ekspor, dan email; ketika dipasang, isi `daily.ts` dan `flushNotificationEmails`
dipindahkan menjadi job, bukan ditulis ulang. Selama itu, dua panggilan idempoten di
timer satu jam sudah cukup: keduanya aman dijalankan berulang.

### Alasan K-21

PRD 6.10 menyebut alurnya, yaitu checkout, notifikasi, faktur PDF, dan pengingat
perpanjangan, tetapi tidak menentukan urutan penulisan baris, sumber kebenaran
pelunasan, dan apa yang terjadi pada masa berbayar yang belum habis. Semua itu
diputuskan di sini.

Baris tagihan ditulis dan di-commit lebih dulu, tautan pembayaran diminta ke Midtrans
setelahnya. Urutan sebaliknya berbahaya: kalau tautan sudah ada di tangan pengguna
sementara baris tagihannya gagal tersimpan, uang bisa masuk untuk pesanan yang tidak
dikenal aplikasi. Panggilan jaringan tidak pernah berada di dalam transaksi database,
jadi Midtrans yang lambat atau menolak tidak menahan kunci baris apa pun; kegagalannya
menandai tagihan `gagal` dan pengguna bisa memulai tagihan baru. Satu tagihan berlaku
24 jam dan sisanya ditutup oleh tugas harian lewat `expires_at`, bukan dibiarkan
menunggu tanpa batas.

Sumber kebenaran pelunasan adalah notifikasi Midtrans yang ditandatangani
(`sha512(order_id + status_code + gross_amount + server_key)`), bukan halaman yang
dibuka pengguna setelah membayar. Halaman itu hanya menampilkan riwayat terbaru.
Notifikasi yang sah dijawab 200 walau pesanannya tidak dikenal supaya Midtrans tidak
mengirim ulang pesan yang tidak akan berubah hasilnya, nominalnya diperiksa lagi
terhadap baris tagihan sebelum melunasi, dan tagihan yang sudah `dibayar` tidak
diperpanjang dua kali sehingga kiriman berulang aman. `deny`, `cancel`, dan `failure`
menjadi `gagal`, `expire` menjadi `kedaluwarsa`, sedangkan refund dan chargeback
diabaikan karena PRD 6.10 tidak mengaturnya: menebak prosesnya sendiri berarti
menghapus catatan uang yang sebenarnya ada.

Masa berbayar menumpuk dari ujung masa yang sedang berjalan, bukan dari waktu
pembayaran. Pemilik yang memperpanjang lebih awal tidak kehilangan sisa harinya, dan
pembelian paket berbeda di tengah masa berjalan berganti paket dengan masa yang
bertambah, bukan mengulang dari nol. Setelah masa itu lewat tanpa pembayaran, paket
turun ke Gratis lewat `effectivePlan`, jalur yang sama dengan uji coba yang berakhir;
baris langganan dan seluruh data usaha tidak dihapus. Uji coba tidak bisa dimulai
selama masa berbayar berjalan, karena uji coba adalah cara menilai paket, bukan cara
memperpanjang tanpa membayar.

Faktur PDF memuat identitas penjual dari environment dan identitas pembeli dari
workspace serta akun pemesan, nomor `INV-<tahun>-<urut>`, paket, masa, metode, tanggal
pelunasan, dan nominal yang benar-benar ditagih. Baris pajak tidak dibuat: perlakuan
pajak langganan masih menunggu konfirmasi konsultan pajak (bagian 8), dan mencantumkan
angka pajak yang belum diputuskan lebih buruk daripada tidak mencantumkannya. Faktur
memakai urutan nomor global lewat `payment_numbers`, bukan `document_sequences` per
workspace, karena faktur diterbitkan penjual untuk semua pelanggan. Tanggal faktur
memakai zona waktu penjual (`BILLING_SELLER_TIMEZONE`, bawaan WIB) dan tanggal pada
tanda terima email memakai zona waktu usaha, supaya tanggal yang dibaca pembeli sama
dengan tanggal di aplikasinya.

Pembayaran hanya menyala kalau `MIDTRANS_SERVER_KEY`, nama, alamat, dan email penjual,
serta `BILLING_REFUND_POLICY_URL` sudah diisi. Faktur tanpa identitas penjual tidak
sah, dan PRD 15 meminta kebijakan refund tertulis tampil sebelum membayar. Selama itu
kosong, halaman paket menjelaskan bahwa pembayaran belum diaktifkan, uji coba 14 hari
tetap bisa dipakai, dan tombol bayar tidak muncul. `PAYMENT_SIMULATION=1` menyediakan
gateway tanpa jaringan untuk pengembangan dan pemeriksaan manual; nilainya diabaikan
di produksi supaya tidak ada tagihan yang bisa dianggap lunas tanpa uang masuk.
Pengingat perpanjangan tujuh hari dan satu hari dikirim ke pemegang izin
`subscription.manage` (Owner) dan tidak mengikuti preferensi notifikasi PRD 6.9,
karena tagihan adalah urusan langganan yang berlaku untuk semua pemilik. Cap waktunya
disimpan per masa di `workspace_subscriptions`, jadi satu tenggat hanya menghasilkan
satu surat, dan cap itu direset saat masa baru dimulai.

### Alasan K-22

PRD 11 menuntut beranda yang menjelaskan masalah pencatatan, alur tiap modul, skenario
usaha, harga, dan pertanyaan umum, tetapi tidak menentukan di mana isinya berada dan
bagaimana gambarnya dibuat. Isinya dipisah ke `apps/web/src/lib/beranda.ts` dan halaman
hanya merender, karena teks promosi yang tidak diuji cepat melenceng: tautan ke halaman
yang belum ada, klaim fitur yang belum berdiri, dan angka paket yang berbeda dari
halaman paket di aplikasi. Tes beranda memeriksa tautan yang ada, label "data contoh"
(K-07), harga yang cocok dengan katalog, dan isi pertanyaan umum.

Gambarnya bukan desain tiruan, melainkan tangkapan layar aplikasi sungguhan dari
workspace contoh "Kedai Kopi Contoh" dengan uji coba Paket Usaha, supaya apa yang
dilihat calon pengguna benar-benar halaman yang ada, bukan gambar rancangan yang
menggambarkan keadaan yang belum berdiri.

Skrip perekamnya ikut di-commit supaya gambar bisa dipotret ulang setiap kali aplikasi
berubah, bukan sekadar tertinggal dari sesi pengembangan tertentu.

Navigasi dan tombolnya hanya menautkan yang benar-benar ada (PRD 5): sementara memakai
loncatan ke bagian beranda sampai halaman modul dan harga berdiri, dan tombol "Lihat
Demo Produk" belum dibuat karena workspace contohnya belum ada (B-13). FAQ menjawab
seadanya: ekspor CSV sudah ada, aplikasi masih butuh internet sampai antrean offline
(Fase 13) selesai, dan aplikasi ini bukan pengganti akuntansi (PRD 2). Butir yang belum
terpasang (cadangan otomatis, enkripsi data saat tersimpan, TLS, kanal dukungan) tidak
dipasang di beranda; melanggengkan klaimnya di teks promosi berarti membuat janji yang
tidak bisa dipenuhi kode.

Alamat kanonik, peta situs, robots, dan metadata membaca `NEXT_PUBLIC_SITE_URL`
(bawaan `http://localhost:3000`) supaya URL absolut tidak ditulis ulang di beberapa
tempat dan berbeda satu sama lain.

### Alasan K-23

PRD 5 dan PRD 11 memerintahkan halaman publik itu ada dan dipasang di navigasi,
tetapi tidak menentukan bentuk isinya untuk soal transparansi. Keputusannya:

- Isi setiap halaman ada di pustakanya sendiri supaya diuji seperti K-22. Tes
  `test/situs.test.ts` memeriksa seluruh tautan situs menunjuk halaman yang ada,
  daftar modul fitur tetap enam (B-11), tiga modul harian memakai daftar fungsi dan
  Pengeluaran, Laporan, dan Langganan dipaparkan dengan paragraf sesuai B-12
  (di beranda tiga modul harian yang ditonjolkan, lainnya diarahkan ke halamannya),
  Pusat Bantuan memuat panduan per modul dan masalah umum (PRD 15), dan tangkapan
  layarnya berlabel data contoh (K-07).
- Halaman Status memakai kalimat "Belum dipantau otomatis" untuk setiap komponen dan
  tidak menampilkan angka ketersediaan, RPO, atau RTO, karena PRD 14 melarang
  menuliskannya sebelum ada tiga bulan data pemantauan dan satu uji restore yang
  berhasil. Riwayat gangguan dinyatakan kosong karena halamannya belum berisi, bukan
  karena klaim "tidak pernah ada gangguan".
- Halaman Kontak tidak mengarang alamat email, nomor WhatsApp, atau jam layanan,
  karena PRD 15 menetapkan jam layanan dan target waktu respons ditulis setelah tim
  dukungan ditetapkan. Yang ditampilkan hanya saluran yang benar-benar hidup
  (Pusat Bantuan) dan saluran yang disiapkan beserta status penyediaannya.
- Dokumen kebijakan dipasang sebagai draf dengan pemberitahuan "Draf, belum berlaku"
  di atas isinya, karena penghalang rilis menetapkan dokumen terbit setelah tinjauan
  penasihat hukum. Isinya hanya menyatakan perilaku yang bisa diverifikasi di kode:
  data yang disimpan, retensi audit per paket, penghapusan workspace dengan masa
  tenggang 30 hari, MFA dengan kode pemulihan, dan ekspor ZIP. Kebijakan refund
  menyatakan ketentuannya belum ditetapkan dan penagihan belum menyala, sehingga
  halaman Harga sudah bisa memenuhi PRD 15 (refund tertulis dan bertaut) tanpa
  memalsukan finalnya.
- Halaman Harga menampilkan catatan "masih usulan awal" sesuai PRD 16 dan hanya
  menklaim MFA, pemisahan workspace, dan ekspor seluruh data; pencadangan berkala
  dan enkripsi saat tersimpan belum dijalankan, jadi tidak ditempatkan di teks
  publik (aturan bukti PRD 11).
- Pusat Bantuan dibangun sebagai satu halaman dengan daftar isi ke bagian per modul
  dan bagian masalah umum. PRD 15 meminta isinya, bukan bentuk situsnya, dan satu
  halaman memenuhi itu tanpa menambah mesin pencari artikel di Fase 12.
- Catatan atas K-22: loncatan ke bagian beranda kini sudah diganti tautan ke
  halaman sungguhan sesuai rencananya, dan tes beranda memeriksa tidak ada lagi
  tautan `#` yang tersisa.

### Alasan K-02

Satu basis kode untuk situs publik dan aplikasi. Situs publik butuh SSR untuk LCP 2,5 detik
(PRD 14) dan data terstruktur per halaman (PRD 11). Aplikasi butuh PWA dan input satu tangan
dari ponsel (PRD 10). Dua frontend terpisah berarti dua kali pemeliharaan.

Fastify dipilih karena schema JSON bawaannya cocok dengan kewajiban validasi di server
(PRD 9), dan bentuk plugin-nya cocok untuk batas per modul pada modular monolith (PRD 13).
PostgreSQL dipilih karena 13 mewajibkan penguncian tingkat baris untuk mencegah stok negatif
dan pembaruan saldo dalam satu transaksi database yang sama dengan ledger.

pg-boss dipilih untuk antrean impor, ekspor, dan email (PRD 13) agar tidak menambah
layanan Redis yang harus dipantau dan dicadangkan.

## 2. Biaya yang belum terverifikasi

Angka tarif hosting dan payment gateway **belum dikonfirmasi** dan tidak boleh dipakai di
dokumen publik apa pun. Tarif resmi harus dibaca dari sumber resmi penyedia pada saat
implementasi, lalu dicatat di sini dengan tanggal pembacaan.

Perkiraan biaya berikut hanya untuk rencana internal dan ditandai belum dikonfirmasi.

| Komponen | Perkiraan per bulan | Status |
| --- | --- | --- |
| PostgreSQL terkelola | USD 15 sampai 35 | belum dikonfirmasi |
| Runtime kontainer di Jakarta | USD 0 sampai 20 | belum dikonfirmasi |
| Penyimpanan objek | USD 1 sampai 5 | belum dikonfirmasi |
| Frontend hosting | USD 20 | belum dikonfirmasi |
| Email transactional | USD 0 sampai 20 | belum dikonfirmasi |
| Pemantauan galat dan pemantau luar | USD 0 sampai 30 | belum dikonfirmasi |
| **Total** | **USD 36 sampai 130** | belum dikonfirmasi |

Risiko yang harus diketahui pemilik produk: 20 workspace berbayar di paket Usaha menghasilkan
Rp1.980.000 per bulan, sementara perkiraan biaya berada di kisaran Rp580.000 sampai
Rp2.090.000 per bulan. Titik impas berada di sekitar 25 sampai 30 workspace berbayar. Paket
Gratis menghasilkan nol pendapatan dan menambah biaya. Harga di PRD 16 juga masih usulan
yang wajib diuji ke 5 sampai 10 pemilik usaha sebelum dikunci.

Tidak ada promise ketersediaan, RPO, atau RTO yang boleh ditulis di halaman harga atau
kontrak sebelum tiga bulan data pemantauan dan satu uji restore berhasil (PRD 14).

## 3. Penyimpanan uang

Nilai uang disimpan sebagai `BIGINT` rupiah penuh, tanpa pecahan sen. Perhitungan diskon dan
pajak dilakukan per baris dengan pembulatan setengah ke atas, dan nilai akhir yang disimpan.

Alasan: format yang PRD 10 tetapkan (`Rp1.250.000`) tidak memuat pecahan, dan `FLOAT` atau
`DOUBLE PRECISION` akan menimbulkan galat pembulatan pada pembukuan. Bila pasar nanti
memerlukan sen, ini perubahan tipe data besar yang harus diputuskan sebelum ada data nyata,
bukan sesudah.

Nomor dokumen memakai format berikut, urutan per workspace per tahun:

| Jenis | Format | Contoh |
| --- | --- | --- |
| Purchase order | `PO-{tahun}-{urutan}` | `PO-2026-0001` |
| Penerimaan barang | `GR-{tahun}-{urutan}` | `GR-2026-0001` |
| Retur pembelian | `PR-{tahun}-{urutan}` | `PR-2026-0001` |
| Pembayaran supplier | `PAY-{tahun}-{urutan}` | `PAY-2026-0001` |
| Penjualan | `INV-{tahun}-{urutan}` | `INV-2026-0001` |

## 4. Entitas data

PRD 13 menyebut daftar entitas inti, tetapi bagian 6 memakai objek yang tidak ada di daftar
itu. Implementasi memakai daftar berikut.

### Dari PRD 13

User, Workspace, Membership, Role, Location, Product, Category, StockMovement,
StockAdjustment, StockCount, StockCountItem, Supplier, PurchaseOrder, PurchaseOrderItem,
PurchaseOrderRevision, GoodsReceipt, GoodsReceiptItem, PurchaseReturn, SupplierPayment,
Customer, Sale, SaleItem, Expense, ImportJob, AuditLog, Subscription, Invoice, Notification.

### Tambahan yang diwajibkan bagian 6

| Entitas | Dipakai di | Alasan |
| --- | --- | --- |
| WorkspaceInvitation | 6.1 | Undangan ber peran, kedaluwarsa, sekali pakai |
| Session dan Device | 6.1 | Daftar perangkat dan sesi aktif, keluarkan semua perangkat |
| EmailVerificationToken | 6.1 | Verifikasi email |
| PasswordResetToken | 9 | Token acak, kedaluwarsa, sekali pakai |
| MfaSecret dan MfaRecoveryCode | 9 | MFA dan pemulihan akun |
| ApprovalPolicy | 8, 6.3 | Aturan approval per workspace, ambang nominal untuk paket Bisnis |
| PaymentMethod | 6.4 | Metode pembayaran diatur Owner, teks bebas dari daftar |
| ExpenseCategory | 6.5 | Kategori pengeluaran diatur Owner dan Admin |
| IdempotencyKey | 9, 13 | Kunci untuk penerimaan, pembayaran, dan impor |
| Attachment | 6.5 | Lampiran foto atau PDF pada pengeluaran |
| WorkspaceSettings | 6.1, 6.3 | Zona waktu, mata uang, format tanggal, aturan approval, masa uji coba |
| Job | 13 | Antrean impor, ekspor, dan email |
| ProductCostSnapshot | 7 | Rata-rata bergerak agar laba kotor historis tidak berubah |

## 5. Aturan rata-rata bergerak

PRD 7 menetapkan rata-rata bergerak per produk per workspace. PRD 7 juga menyebutkan
penghitungan ulang setiap penerimaan barang, tetapi bagian 6 membuat perubahan stok lain yang
tidak disebut. Implementasi memakai aturan berikut.

Nilai per satuan dihitung ulang pada tiga peristiwa:

1. Penerimaan barang.
2. Retur pembelian.
3. Koreksi harga beli pada PO yang sudah diterima, lewat revisi bernomor.

Ketika saldo barang menjadi nol, rata-rata direset ke harga penerimaan berikutnya.

Laba kotor memakai `harga_pokok_snapshot` yang ditulis pada baris penjualan saat transaksi
dibuat. Pembatalan penjualan mengembalikan stok memakai snapshot itu, bukan rata-rata yang
sekarang. Konsekuensinya, laba kotor bulan lalu tidak berubah karena ada penerimaan baru
bulan ini.

## 6. Token warna yang diverifikasi

Semua angka di PRD 10 dihitung ulang dengan `contrast-check.py` dan cocok. Satu temuan:
`#8A94A6` di `#F7F9FC` hanya 2,90:1, sehingga gagal syarat 3:1 milik PRD 10 sendiri.

| Token | Nilai | Pemakaian | Rasio terverifikasi |
| --- | --- | --- | --- |
| `--color-primary` | `#172B4D` | Navigasi, judul | 14,10:1 di putih |
| `--color-secondary` | `#0B7A6B` | Tombol utama, tautan, aksi positif | 5,24:1 di putih |
| `--color-accent` | `#F5B544` | Isian sorotan saja, tidak pernah sebagai warna teks di atas putih | 1,81:1 di putih, jadi dilarang sebagai teks |
| `--color-text-on-accent` | `#17212F` | Teks di atas isian aksen | 8,94:1 |
| `--color-background` | `#F7F9FC` | Latar aplikasi | |
| `--color-surface` | `#FFFFFF` | Kartu dan panel | |
| `--color-text-primary` | `#17212F` | Isi | 15,37:1 di background |
| `--color-text-secondary` | `#475569` | Keterangan dan placeholder | 7,18:1 di background, 7,58:1 di putih |
| `--color-success` | `#15803D` | Status, selalu bersama teks atau ikon | 5,02:1 di putih, 4,76:1 di background |
| `--color-warning` | `#B45309` | Status, selalu bersama teks atau ikon | 5,02:1 di putih, 4,76:1 di background |
| `--color-danger` | `#B91C1C` | Status, selalu bersama teks atau ikon | 6,47:1 di putih, 6,13:1 di background |
| `--color-border-strong` | `#6E7A8A` | Batas input dan komponen | 4,14:1 di background, memenuhi 3:1 |
| `--color-focus-ring` | `#0B7A6B` | Cincin fokus | 4,96:1 di background, memenuhi 3:1 |

Nama variabel di atas mengikuti tema Tailwind (`--color-*` di
`apps/web/src/styles/globals.css`). Warna turunan untuk keadaan komponen, seperti hover
tombol utama, latar pesan galat dan sukses, serta lencana sesi, ikut dijaga di
`packages/design-tokens/src/tokens.ts` dan diperiksa `npm run test:contrast`.

`#8A94A6` tidak boleh dipakai sebagai batas input, karena gagal 3:1 di atas latar aplikasi.
Batas dekoratif yang tidak membawa informasi boleh memakai nilai itu.

Aksen kuning dipakai sebagai isian sorotan dengan teks `#17212F`, sesuai PRD 10. Warna ini
tidak dipakai sebagai warna teks di atas putih. Identitas visual memegang satu aksen hijau
kebiruan, yaitu `#0B7A6B`, dan kuning diperlakukan sebagai warna data, bukan warna merek.

## 7. Baoan yang sudah disetujui

Seluruh usulan di bagian ini disetujui pemilik produk pada 9 Oktober 2026 dan menjadi
nilai tetap. A-01 sampai A-11 dan B-01 sampai B-13 tidak lagi berstatus usulan.

Ringkasan singkat per butir ada di tabel di bawah. Nilai lengkapnya tetap di
`docs/ARSITEKTUR.md` dan di kode.

### Golong A

| No | Isu | Usulan default |
| --- | --- | --- |
| A-01 | PRD 3-butir-1 mengimpor 200 produk, PRD 16 memberi paket Gratis hanya 100 produk aktif | Validasi impor memeriksa batas paket di server dan menolak baris berlebih dengan pesan yang menyebut angka batas dan cara naikkan paket. Skenario 1 diuji dua kali: di Gratis harus gagal dengan pesan jelas, setelah naik ke Usaha harus berhasil 200 baris |
| A-02 | PRD 6.6 mengizinkan ekspor CSV dan XLSX untuk semua laporan, PRD 16 memberi paket Gratis hanya CSV | Paket Gratis: CSV dan cetak. Paket Usaha dan Bisnis: CSV dan XLSX |
| A-03 | PRD 6.3 membuat retur mengurangi stok, PRD 6.2 dan 13 melarang stok negatif | Retur ditolak bila saldo di lokasi terkait tidak cukup, dengan pesan yang menyebut produk, lokasi, dan saldo tersedia |
| A-04 | PRD 6.7 memuat kartu penjualan dan utang jatuh tempo, PRD 16 tidak memberi keduanya ke paket Gratis | Setiap kartu menyebutkan paket minimumnya. Kartu di bawah batas paket tidak dirender, diganti keterangan singkat yang menyebut paket dan batasnya |
| A-05 | PRD 6.2 menyimpan tanggal kedaluwarsa per penerimaan, tapi 13 tidak punya entitas lot dan 4 menunda transfer berstatus transit | 1.0 tidak mengimplementasikan alokasi FEFO. Tanggal kedaluwarsa yang ditampilkan adalah yang paling awal dari penerimaan aktif per produk dan lokasi, dengan label eksplisit di laporan. |
| A-06 | PRD 7 hanya menyebut penghitungan ulang rata-rata pada penerimaan barang | Hitung ulang pada penerimaan barang, retur pembelian, dan koreksi harga beli lewat revisi. Saldo nol mereset rata-rata ke harga penerimaan berikutnya |
| A-07 | PRD 7 membuat laba kotor memakai rata-rata bergerak "pada saat penjualan", sehingga angka lama bisa berubah karena ada penerimaan baru | Simpan `harga_pokok_snapshot` di setiap baris penjualan. Pembatalan mengembalikan stok memakai snapshot itu |
| A-08 | Pembayaran supplier tanpa PO yang dipilih tidak punya aturan alokasi | Kalau pembayaran memilih PO, alokasi ke PO itu. Tanpa PO, alokasi otomatis FIFO berdasarkan jatuh tempo lalu nomor PO, alokasi ditampilkan dan dapat dibalik Owner dengan audit |
| A-09 | Tipe kolom uang tidak ditetapkan | `BIGINT` rupiah penuh, pembulatan setengah ke atas per baris. Lihat bagian 3 |
| A-10 | Daftar entitas PRD 13 tidak lengkap dibanding bagian 6 | Lihat bagian 4 |
| A-11 | PRD 6.3 mengizinkan tautan baca-saja untuk PO, PRD 9 mewajibkan semua data bisnis terikat workspace | Tautan bertoken acak, kedaluwarsa 30 hari secara bawaan dan dapat diubah Owner, dapat dicabut kapan saja, diberi `noindex`, setiap pembukaan masuk audit log dengan IP dan waktu. |

### Golong B

| No | Isu | Usulan default |
| --- | --- | --- |
| B-01 | "Anggota dan peran: Admin Sebagian" tidak jelas batasnya | Admin dapat mengundang staf, purchasing, dan viewer. Admin tidak dapat menetapkan peran Admin, tidak dapat mengubah peran Owner, dan tidak dapat mengelola langganan |
| B-02 | Izin laporan Viewer tertulis "Sesuai izin" | Viewer mendapat laporan posisi stok, pergerakan stok, dan penjualan. Viewer tidak mendapat laporan pembelian, utang supplier, dan laba kotor, karena Viewer tidak boleh melihat harga beli supplier. |
| B-03 | PRD 8 menyebut persetujuan PO "Sesuai aturan", PRD 16 hanya memberi approval berjenjang ke paket Bisnis | Persetujuan satu tingkat ada di semua paket saat aturan approval workspace aktif. Multi tingkat ambang nominal hanya di paket Bisnis. Owner dan Admin selalu boleh menyetujui, Purchasing hanya bila pengaturan workspace mengizinkan |
| B-04 | "Dapat dibatalkan dalam 24 jam" pada PRD 6.8 tidak punya batas | Batalkan impor bila belum ada transaksi turunan yang menyentuh baris hasil impor. Data master seperti produk dan supplier selalu dapat dibatalkan karena tidak menghasilkan transaksi |
| B-05 | Retensi audit log berbeda per paket pada PRD 16, PRD 6.10 menyebut audit log dasar ada di semua paket | 30 hari menjadi minimum semua paket. Entri yang lebih lama dari retensi paket dihapus permanen dan hal ini dinyatakan di Kebijakan Privasi |
| B-06 | Masa uji coba tidak disebutkan | 14 hari tanpa kartu. Berakhir otomatis ke paket Gratis dengan data utuh dan fitur di atas batas dikunci menjadi baca saja, sesuai PRD 6.10 |
| B-07 | Satuan dan metode pembayaran tidak punya tempat di menu PRD 5 | Satuan dikelola di dalam form produk dengan daftar sarat. Metode pembayaran diatur di Pengaturan oleh Owner |
| B-08 | Status produk tidak didefinisikan | Aktif, Nonaktif, Diarsipkan. Batas paket "produk aktif" hanya menghitung status Aktif. Status turunan untuk dashboard: Habis (saldo 0), Stok Rendah (saldo di bawah atau sama batas minimum), Normal |
| B-09 | Kode pemulihan MFA tidak disebut di PRD 9 | Sertakan kode pemulihan sekali pakai. Tanpa ini, MFA dapat mengunci akun dan Owner yang diwajibkan memakai MFA tidak dapat masuk. Ini tambahan kecil di luar PRD, saya usulkan sebagai kebutuhan agar Owner tidak terkunci dari akunnya sendiri |
| B-10 | Mata uang dan format tanggal pada PRD 6.1 | Mata uang tetap Rupiah di 1.0 dan field-nya baca saja. Format tanggal dan zona waktu mengikuti workspace. Waktu disimpan UTC, hari dan periode laporan dihitung menurut zona waktu workspace |
| B-11 | PRD 11 meminta satu halaman fitur per modul tanpa menyebut daftarnya | Enam halaman fitur: Stok, Pembelian, Penjualan, Pengeluaran, Laporan dan Dashboard, Langganan |
| B-12 | PRD 11 meminta cara kerja setiap modul dengan jumlah bagian mengikuti jumlah modul | Cara kerja dibangun untuk tiga modul yang dipakai staf dan pemilik setiap hari, yaitu Stok, Pembelian, dan Penjualan. Pengeluaran, Laporan, dan Langganan dijelaskan satu paragraf di halaman fiturnya. |
| B-13 | Tombol "Lihat Demo Produk" pada PRD 11 butuh tujuan yang nyata | Workspace contoh yang dapat dibuka tanpa login, diberi label "data contoh" di setiap layar, dapat dihapus sekali klik sesuai PRD 12 |

## 8. Penghalang rilis yang di luar kendali kode

Butir ini menentukan boleh atau tidaknya produk dijual dan ditagih (PRD 17), dan tidak
bisa diselesaikan dengan menulis kode.

| Penghalang | PRD | Status |
| --- | --- | --- |
| Badge domain dan merek "Sahabat UMKM" sudah diperiksa | 20 | belum |
| Badan usaha penjual, rekening penerima, dan kewajiban pajak langganan ditetapkan | 15, 20 | belum, wajib dikonfirmasi ke konsultan pajak |
| Syarat dan Ketentuan, Kebijakan Privasi, Kebijakan Refund, Perjanjian Pemrosesan Data terbit setelah ditinjau penasihat hukum | 15 | belum, draf berlabel "belum berlaku" sudah dipasang (K-23), dokumen final menunggu tinjauan |
| Kebijakan refund tertulis dan tampil di halaman Harga dan saat checkout | 15 | belum, tertulis sebagai draf dan bertaut dari halaman Harga (K-23); tautan di checkout menunggu penagihan menyala (K-21) |
| Uji penerimaan pengguna dengan sedikitnya lima pemilik usaha selesai | 17 | belum |
| Uji restore backup berhasil dan waktunya tercatat | 17, 14 | belum |
| Uji penetrasi oleh pihak yang bukan pengembang produk | 17 | belum |
| Penanggung jawab dukungan dan jam layanan ditunjuk | 15, 20 | belum |
| Tarif resmi payment gateway dibaca dari sumber resmi | 6.10 | belum |
| Kunci Midtrans sandbox dan produksi, identitas penjual pada faktur, dan tautan kebijakan refund tersedia | 6.10, 15 | belum, pembayaran tetap mati sampai semuanya diisi |
| Pembayaran sungguhan diuji dari checkout sampai faktur tersimpan, termasuk penerimaan notifikasi Midtrans | 17 | belum, butuh kunci sandbox atau produksi |

## 9. Aturan kerja yang berlaku di semua fase

- Setiap perubahan stok adalah baris ledger yang tidak dapat diubah atau dihapus. Koreksi
  dibuat sebagai transaksi baru (PRD 6.2, 13).
- Saldo diperbarui dalam satu transaksi database yang sama dengan ledger, dengan
  penguncian tingkat baris (PRD 13).
- Stok negatif ditolak. Transaksi gagal tidak mengubah saldo (PRD 6.2).
- Penerimaan, pembayaran, dan impor memakai kunci idempotency yang disimpan (PRD 9, 13).
- Setiap query dan endpoint dibatasi ke workspace dan memeriksa izin di server. Menyembunyikan
  tombol bukan kontrol keamanan (PRD 8, 9).
- Tes otomatis mencoba mengakses objek milik workspace lain dan harus gagal. Tes ini berjalan
  di setiap build (PRD 9, 17).
- Semua teks antarmuka memakai Bahasa Indonesia dengan sapaan "Anda" (PRD 11).
- Tidak ada secret di repositori. `.env.example` disediakan (PRD 9).
- Tidak ada fitur di luar PRD. Usulan tambahan selalu dipresentedasikan lebih dulu.
- Tidak ada klaim keamanan, jumlah pengguna, testimoni, atau angka yang tidak dapat
  diverifikasi (PRD 11, 17, 9).
- Tiga keadaan tampilan data: memuat, kosong, dan galat. Semua fungsi dapat dioperasikan
  dengan keyboard (PRD 10).
- Tata letak dimulai dari ukuran ponsel lalu naik ke desktop. Target sentuh minimal
  44 x 44 px, tidak ada gulir horizontal pada halaman (PRD 10).
