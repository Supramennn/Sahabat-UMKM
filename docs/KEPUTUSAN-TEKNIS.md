# Catatan Keputusan Teknis Sahabat UMKM

Status: aktif. Sumber kebenaran produk tetap `docs/PRD-Sahabat-UMKM.md`. Dokumen ini mencatat
keputusan yang PRD delegasikan ke tim, beserta alasannya, supaya setiap fase bisa merujuk
nomor yang sama.

Terakhir diperbarui: 9 Oktober 2026.

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
| `--primary` | `#172B4D` | Navigasi, judul | 14,10:1 di putih |
| `--secondary` | `#0B7A6B` | Tombol utama, tautan, aksi positif | 5,24:1 di putih |
| `--accent` | `#F5B544` | Isian sorotan saja, tidak pernah sebagai warna teks di atas putih | 1,81:1 di putih, jadi dilarang sebagai teks |
| `--text-on-accent` | `#17212F` | Teks di atas isian aksen | 8,94:1 |
| `--background` | `#F7F9FC` | Latar aplikasi | |
| `--surface` | `#FFFFFF` | Kartu dan panel | |
| `--text-primary` | `#17212F` | Isi | 15,37:1 di background |
| `--text-secondary` | `#475569` | Keterangan dan placeholder | 7,18:1 di background, 7,58:1 di putih |
| `--success` | `#15803D` | Status, selalu bersama teks atau ikon | 5,02:1 di putih, 4,76:1 di background |
| `--warning` | `#B45309` | Status, selalu bersama teks atau ikon | 5,02:1 di putih, 4,76:1 di background |
| `--danger` | `#B91C1C` | Status, selalu bersama teks atau ikon | 6,47:1 di putih, 6,13:1 di background |
| `--border-strong` | `#6E7A8A` | Batas input dan komponen | 4,14:1 di background, memenuhi 3:1 |
| `--focus-ring` | `#0B7A6B` | Cincin fokus | 4,96:1 di background, memenuhi 3:1 |

`#8A94A6` tidak boleh dipakai sebagai batas input, karena gagal 3:1 di atas latar aplikasi.
Batas dekoratif yang tidak membawa informasi boleh memakai nilai itu.

Aksen kuning dipakai sebagai isian sorotan dengan teks `#17212F`, sesuai PRD 10. Warna ini
tidak dipakai sebagai warna teks di atas putih. Identitas visual memegang satu aksen hijau
kebiruan, yaitu `#0B7A6B`, dan kuning diperlakukan sebagai warna data, bukan warna merek.

## 7. Baoan yang belum diputuskan dan yang memakai usulan default

Semua butir di bagian ini berstatus **usulan**. Saya implementasikan usulan tersebut sebagai
nilai default sampai pemilik produk mengubahnya, kecuali butir bertanda `[perlu persetujuan]`
yang saya tanyakan secara eksplisit karena sulit dibalik setelah ada data.

### Golong A

| No | Isu | Usulan default |
| --- | --- | --- |
| A-01 | PRD 3-butir-1 mengimpor 200 produk, PRD 16 memberi paket Gratis hanya 100 produk aktif | Validasi impor memeriksa batas paket di server dan menolak baris berlebih dengan pesan yang menyebut angka batas dan cara naikkan paket. Skenario 1 diuji dua kali: di Gratis harus gagal dengan pesan jelas, setelah naik ke Usaha harus berhasil 200 baris |
| A-02 | PRD 6.6 mengizinkan ekspor CSV dan XLSX untuk semua laporan, PRD 16 memberi paket Gratis hanya CSV | Paket Gratis: CSV dan cetak. Paket Usaha dan Bisnis: CSV dan XLSX |
| A-03 | PRD 6.3 membuat retur mengurangi stok, PRD 6.2 dan 13 melarang stok negatif | Retur ditolak bila saldo di lokasi terkait tidak cukup, dengan pesan yang menyebut produk, lokasi, dan saldo tersedia |
| A-04 | PRD 6.7 memuat kartu penjualan dan utang jatuh tempo, PRD 16 tidak memberi keduanya ke paket Gratis | Setiap kartu menyebutkan paket minimumnya. Kartu di bawah batas paket tidak dirender, diganti keterangan singkat yang menyebut paket dan batasnya |
| A-05 | PRD 6.2 menyimpan tanggal kedaluwarsa per penerimaan, tapi 13 tidak punya entitas lot dan 4 menunda transfer berstatus transit | 1.0 tidak mengimplementasikan alokasi FEFO. Tanggal kedaluwarsa yang ditampilkan adalah yang paling awal dari penerimaan aktif per produk dan lokasi, dengan label eksplisit di laporan. `[perlu persetujuan]` |
| A-06 | PRD 7 hanya menyebut penghitungan ulang rata-rata pada penerimaan barang | Hitung ulang pada penerimaan barang, retur pembelian, dan koreksi harga beli lewat revisi. Saldo nol mereset rata-rata ke harga penerimaan berikutnya |
| A-07 | PRD 7 membuat laba kotor memakai rata-rata bergerak "pada saat penjualan", sehingga angka lama bisa berubah karena ada penerimaan baru | Simpan `harga_pokok_snapshot` di setiap baris penjualan. Pembatalan mengembalikan stok memakai snapshot itu |
| A-08 | Pembayaran supplier tanpa PO yang dipilih tidak punya aturan alokasi | Kalau pembayaran memilih PO, alokasi ke PO itu. Tanpa PO, alokasi otomatis FIFO berdasarkan jatuh tempo lalu nomor PO, alokasi ditampilkan dan dapat dibalik Owner dengan audit |
| A-09 | Tipe kolom uang tidak ditetapkan | `BIGINT` rupiah penuh, pembulatan setengah ke atas per baris. Lihat bagian 3 |
| A-10 | Daftar entitas PRD 13 tidak lengkap dibanding bagian 6 | Lihat bagian 4 |
| A-11 | PRD 6.3 mengizinkan tautan baca-saja untuk PO, PRD 9 mewajibkan semua data bisnis terikat workspace | Tautan bertoken acak, kedaluwarsa 30 hari secara bawaan dan dapat diubah Owner, dapat dicabut kapan saja, diberi `noindex`, setiap pembukaan masuk audit log dengan IP dan waktu. `[perlu persetujuan]` |

### Golong B

| No | Isu | Usulan default |
| --- | --- | --- |
| B-01 | "Anggota dan peran: Admin Sebagian" tidak jelas batasnya | Admin dapat mengundang staf, purchasing, dan viewer. Admin tidak dapat menetapkan peran Admin, tidak dapat mengubah peran Owner, dan tidak dapat mengelola langganan |
| B-02 | Izin laporan Viewer tertulis "Sesuai izin" | Viewer mendapat laporan posisi stok, pergerakan stok, dan penjualan. Viewer tidak mendapat laporan pembelian, utang supplier, dan laba kotor, karena Viewer tidak boleh melihat harga beli supplier. `[perlu persetujuan]` |
| B-03 | PRD 8 menyebut persetujuan PO "Sesuai aturan", PRD 16 hanya memberi approval berjenjang ke paket Bisnis | Persetujuan satu tingkat ada di semua paket saat aturan approval workspace aktif. Multi tingkat ambang nominal hanya di paket Bisnis. Owner dan Admin selalu boleh menyetujui, Purchasing hanya bila pengaturan workspace mengizinkan |
| B-04 | "Dapat dibatalkan dalam 24 jam" pada PRD 6.8 tidak punya batas | Batalkan impor bila belum ada transaksi turunan yang menyentuh baris hasil impor. Data master seperti produk dan supplier selalu dapat dibatalkan karena tidak menghasilkan transaksi |
| B-05 | Retensi audit log berbeda per paket pada PRD 16, PRD 6.10 menyebut audit log dasar ada di semua paket | 30 hari menjadi minimum semua paket. Entri yang lebih lama dari retensi paket dihapus permanen dan hal ini dinyatakan di Kebijakan Privasi |
| B-06 | Masa uji coba tidak disebutkan | 14 hari tanpa kartu. Berakhir otomatis ke paket Gratis dengan data utuh dan fitur di atas batas dikunci menjadi baca saja, sesuai PRD 6.10 |
| B-07 | Satuan dan metode pembayaran tidak punya tempat di menu PRD 5 | Satuan dikelola di dalam form produk dengan daftar sarat. Metode pembayaran diatur di Pengaturan oleh Owner |
| B-08 | Status produk tidak didefinisikan | Aktif, Nonaktif, Diarsipkan. Batas paket "produk aktif" hanya menghitung status Aktif. Status turunan untuk dashboard: Habis (saldo 0), Stok Rendah (saldo di bawah atau sama batas minimum), Normal |
| B-09 | Kode pemulihan MFA tidak disebut di PRD 9 | Sertakan kode pemulihan sekali pakai. Tanpa ini, MFA dapat mengunci akun dan Owner yang diwajibkan memakai MFA tidak dapat masuk. Ini tambahan kecil di luar PRD, saya usulkan sebagai kebutuhan agar Owner tidak terkunci dari akunnya sendiri |
| B-10 | Mata uang dan format tanggal pada PRD 6.1 | Mata uang tetap Rupiah di 1.0 dan field-nya baca saja. Format tanggal dan zona waktu mengikuti workspace. Waktu disimpan UTC, hari dan periode laporan dihitung menurut zona waktu workspace |
| B-11 | PRD 11 meminta satu halaman fitur per modul tanpa menyebut daftarnya | Enam halaman fitur: Stok, Pembelian, Penjualan, Pengeluaran, Laporan dan Dashboard, Langganan |
| B-12 | PRD 11 meminta cara kerja setiap modul dengan jumlah bagian mengikuti jumlah modul | Cara kerja dibangun untuk tiga modul yang dipakai staf dan pemilik setiap hari, yaitu Stok, Pembelian, dan Penjualan. Pengeluaran, Laporan, dan Langganan dijelaskan satu paragraf di halaman fiturnya. `[perlu persetujuan]` |
| B-13 | Tombol "Lihat Demo Produk" pada PRD 11 butuh tujuan yang nyata | Workspace contoh yang dapat dibuka tanpa login, diberi label "data contoh" di setiap layar, dapat dihapus sekali klik sesuai PRD 12 |

## 8. Penghalang rilis yang di luar kendali kode

Butir ini menentukan boleh atau tidaknya produk dijual dan ditagih (PRD 17), dan tidak
bisa diselesaikan dengan menulis kode.

| Penghalang | PRD | Status |
| --- | --- | --- |
| Badge domain dan merek "Sahabat UMKM" sudah diperiksa | 20 | belum |
| Badan usaha penjual, rekening penerima, dan kewajiban pajak langganan ditetapkan | 15, 20 | belum, wajib dikonfirmasi ke konsultan pajak |
| Syarat dan Ketentuan, Kebijakan Privasi, Kebijakan Refund, Perjanjian Pemrosesan Data terbit setelah ditinjau penasihat hukum | 15 | belum |
| Kebijakan refund tertulis dan tampil di halaman Harga dan saat checkout | 15 | belum |
| Uji penerimaan pengguna dengan sedikitnya lima pemilik usaha selesai | 17 | belum |
| Uji restore backup berhasil dan waktunya tercatat | 17, 14 | belum |
| Uji penetrasi oleh pihak yang bukan pengembang produk | 17 | belum |
| Penanggung jawab dukungan dan jam layanan ditunjuk | 15, 20 | belum |
| Tarif resmi payment gateway dibaca dari sumber resmi | 6.10 | belum |

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
