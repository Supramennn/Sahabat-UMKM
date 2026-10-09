# PRD Sahabat UMKM v2.0

Disusun oleh Nexus Diji | 9 Oktober 2026 | Status: spesifikasi produk jadi untuk rilis komersial (1.0 GA)

Sahabat UMKM adalah aplikasi web untuk mencatat stok, mengelola pembelian ke supplier, mencatat penjualan, dan membaca laporan usaha. Dokumen ini menggantikan PRD "Beresin Usaha" v1.0 (Draft MVP).

## 1. Hasil analisis PRD lama

| No | Temuan | Dampak | Perbaikan di v2.0 |
| --- | --- | --- | --- |
| 1 | Berlabel MVP. Billing, penjualan, dan multi-lokasi ditunda. | Produk tidak bisa menagih pelanggan dan stok keluar hanya lewat input manual. | Billing, penjualan sederhana, dan multi-lokasi masuk rilis 1.0 (bagian 6 dan 16). |
| 2 | Laporan membedakan penjualan, pendapatan, dan laba, tetapi tidak ada modul penjualan. Keputusan POS dibiarkan terbuka. | Metrik tidak bisa dihitung. | Modul penjualan sederhana, definisi metrik, dan metode persediaan ditetapkan (bagian 6.4 dan 7). |
| 3 | Warna sekunder #0F9D8A dengan teks putih hanya 3,38:1. Aksen #F5B544 dengan teks putih 1,81:1. Teks sekunder #64748B di #F7F9FC 4,51:1, lolos tipis. | Tombol utama gagal WCAG AA, padahal PRD menargetkannya. | Secondary #0B7A6B (5,24:1), teks sekunder #475569 (7,18:1), aksen hanya sebagai isian dengan teks #17212F (8,94:1). |
| 4 | Contoh copy memakai "lo" di dokumen formal. Headline menjanjikan "Keputusan Lebih Pasti" tanpa dasar. | Suara merek tidak konsisten dan klaim tidak bisa dibuktikan. | Sapaan "Anda" dan copy tanpa klaim hasil (bagian 11). |
| 5 | Harga "ditetapkan setelah riset". | Tidak ada yang bisa dijual hari ini. | Usulan paket, harga awal, dan batas (bagian 16). |
| 6 | Ketersediaan 99,5%, RPO, RTO, dan metrik awal tidak punya cara ukur atau syarat sebelum dijanjikan. | Tidak bisa diuji sebelum rilis. | Target berangka, alat ukur, dan syarat janji ke pelanggan (bagian 14). |
| 7 | Tidak ada stok opname, retur pembelian, utang supplier, dan tanggal kedaluwarsa. | Usaha makanan, minuman, dan retail langsung menemui celah ini. | Ditambahkan (bagian 6.2 dan 6.3). |
| 8 | Tidak ada dukungan pelanggan, dokumen hukum, kebijakan refund, dan halaman status. | Belum layak menerima pelanggan berbayar. | Bagian 15. |
| 9 | Aplikasi native ditunda, padahal pemilik UMKM umumnya bekerja dari ponsel. | Input harian di ponsel jadi titik lemah. | PWA yang bisa dipasang, input stok satu tangan (bagian 10). |
| 10 | Tidak ada kriteria kapan produk boleh dijual. | Rilis ditentukan perasaan. | Daftar periksa rilis komersial (bagian 17). |

Yang dipertahankan karena sudah tepat: modular monolith, isolasi antar-workspace, ledger stok yang tidak bisa diubah diam-diam, idempotency penerimaan barang, audit log, dan larangan menyebut total pembelian sebagai laba.

## 2. Ringkasan produk

Visi: UMKM bisa menjalankan operasional harian dengan catatan yang rapi dan bisa dipercaya, tanpa rekap manual.

Proposisi nilai: catat stok, belanja ke supplier, catat penjualan, dan baca laporan usaha di satu tempat.

Segmen pertama: usaha makanan dan minuman serta retail kecil. Contoh kasus penggunaan lain (katering, usaha rumahan) tetap didukung, tetapi materi onboarding dan bantuan ditulis untuk dua segmen pertama.

Batas produk:

- Bukan sistem akuntansi. Tidak ada jurnal, neraca, atau perhitungan pajak.
- Bukan kasir penuh. Penjualan dicatat manual atau lewat impor, tanpa printer struk, EDC, atau pembayaran digital pada rilis 1.0.
- Laporan bersifat operasional. Total pembelian tidak pernah ditampilkan sebagai laba.

## 3. Pengguna dan skenario utama

| Persona | Masalah | Kebutuhan |
| --- | --- | --- |
| Pemilik usaha | Tidak tahu stok mana yang menipis dan berapa belanja bulan ini. | Ringkasan harian, peringatan stok, laporan yang bisa diekspor. |
| Admin dan purchasing | PO dan penerimaan barang dicatat di chat atau kertas. | Supplier, PO, penerimaan bertahap, utang supplier. |
| Manajer | Sulit memeriksa apa yang terjadi di beberapa lokasi. | Dashboard per lokasi, approval, audit. |
| Staf | Butuh input cepat dari ponsel saat barang datang atau habis. | Form pendek, izin terbatas, bekerja di sinyal lemah. |

Skenario yang harus berjalan tanpa bantuan tim kami:

1. Pemilik mendaftar, membuat workspace, mengimpor 200 produk dari CSV, dan melihat dashboard pertamanya dalam satu sesi.
2. Staf mencatat barang keluar dari ponsel dalam satu menit.
3. Purchasing membuat PO dari daftar stok rendah, mengirim ke supplier, lalu menerima barang sebagian dua kali.
4. Manajer menyetujui PO yang dibuat orang lain.
5. Pemilik menjalankan stok opname akhir bulan dan melihat selisihnya.
6. Pemilik memilih paket berbayar, membayar, dan menerima faktur tanpa menghubungi kami.

## 4. Lingkup rilis 1.0

Di dalam lingkup:

- Akun, workspace, anggota, peran, dan MFA.
- Produk, kategori, satuan, lokasi, stok, stok opname, tanggal kedaluwarsa opsional.
- Supplier, PO, approval, penerimaan, retur pembelian, pencatatan pembayaran supplier.
- Penjualan sederhana dan pelanggan opsional.
- Pengeluaran operasional.
- Laporan, dashboard, ekspor, impor.
- Notifikasi email dan di dalam aplikasi.
- Langganan, penagihan, faktur.
- Situs publik, pusat bantuan, dukungan pelanggan, halaman status.

Di luar lingkup rilis 1.0 (dijadwalkan di bagian 18):

- Integrasi marketplace dan bank.
- Akuntansi lengkap, payroll, pajak otomatis.
- Aplikasi native iOS dan Android.
- Prediksi berbasis model statistik atau AI.
- Pemindaian barcode lewat kamera. Pemindai USB atau Bluetooth yang bekerja sebagai keyboard tetap didukung.
- Transfer stok dengan status transit.

## 5. Struktur situs dan navigasi

Situs publik: Beranda, Fitur (satu halaman per modul), Untuk usaha F&B dan retail, Harga, Pusat Bantuan, Tentang, Kontak, Status Layanan, Kebijakan Privasi, Syarat dan Ketentuan, Kebijakan Refund, Masuk, Buat Akun.

Setiap tautan di navigasi harus mengarah ke halaman yang sudah ada saat rilis. Halaman yang belum siap tidak dipasang di menu.

Aplikasi setelah login:

- Dashboard
- Stok: Barang, Kategori, Lokasi, Riwayat, Penyesuaian, Stok Opname
- Pembelian: Supplier, Purchase Order, Penerimaan, Retur, Pembayaran
- Penjualan: Daftar Penjualan, Pelanggan
- Pengeluaran
- Laporan
- Pengaturan: Profil Usaha, Anggota dan Peran, Notifikasi, Impor dan Ekspor, Langganan dan Faktur, Keamanan Akun

## 6. Persyaratan fungsional

### 6.1 Akun dan workspace

- Daftar dengan email dan password, verifikasi email, masuk, keluar, reset password, ganti password, ganti email.
- Satu akun bisa menjadi anggota beberapa workspace dan berpindah lewat pemilih workspace.
- Undangan anggota lewat email dengan peran yang ditetapkan pengundang. Tautan undangan kedaluwarsa dan sekali pakai.
- Profil usaha: nama, jenis usaha, zona waktu, mata uang Rupiah, format tanggal, logo opsional.
- Daftar perangkat dan sesi aktif, dengan tombol keluarkan dari semua perangkat.
- Penghapusan workspace oleh Owner dengan konfirmasi berlapis, masa tenggang 30 hari, dan ekspor data sebelum penghapusan permanen.

### 6.2 Stok

- Produk: SKU unik per workspace, nama, kategori, satuan, harga beli referensi, harga jual, batas minimum, status, foto opsional, tanggal kedaluwarsa opsional per penerimaan.
- Lokasi: sampai jumlah yang diizinkan paket. Saldo dihitung per produk per lokasi.
- Stok masuk, keluar, dan penyesuaian menyimpan tanggal, jumlah, alasan, referensi, lokasi, pelaku, serta saldo sebelum dan sesudah.
- Stok negatif ditolak. Transaksi gagal tidak mengubah saldo.
- Stok opname: Owner atau Admin membuka sesi hitung untuk satu lokasi, staf memasukkan jumlah fisik, sistem menampilkan selisih, dan penyetujuan menghasilkan transaksi penyesuaian. Sesi bisa dilanjutkan di hari berikutnya.
- Peringatan stok rendah dan hampir kedaluwarsa memakai batas yang diatur per produk.
- Arsip produk menyembunyikannya dari input baru tanpa menghapus riwayat.

Kriteria penerimaan:

- Saldo selalu sama dengan jumlah semua transaksi yang berhasil.
- Riwayat tidak dapat diubah atau dihapus. Koreksi dibuat sebagai transaksi baru.
- Dua pengguna yang mengeluarkan stok terakhir secara bersamaan menghasilkan satu transaksi berhasil dan satu penolakan dengan pesan yang jelas.
- Pengguna tidak dapat membaca atau mengubah data workspace lain.

### 6.3 Pembelian

- Supplier: nama, kontak, telepon, email, alamat, termin pembayaran, catatan, status.
- PO: nomor otomatis unik per workspace, supplier, lokasi tujuan, tanggal, item, jumlah, harga, diskon, total, catatan, pembuat, status.
- Alur status: Draft, Diajukan, Disetujui, Diterima Sebagian, Diterima, Ditutup. Cabang: Ditolak, Dibatalkan.
- PO dibuat langsung dari daftar stok rendah dengan jumlah usulan yang bisa diubah.
- PO yang sudah disetujui tidak bisa diubah. Perubahan lewat revisi bernomor dengan catatan alasan dan jejak audit.
- Pembuat PO tidak bisa menyetujui PO sendiri bila aturan approval diaktifkan.
- Penerimaan bisa bertahap. Stok bertambah hanya sebesar jumlah yang diterima. Permintaan penerimaan yang dikirim dua kali tidak menggandakan stok.
- Retur pembelian mengurangi stok dan mengurangi nilai utang pada PO terkait.
- Pembayaran supplier: catat tanggal, jumlah, metode, dan referensi. Sistem menampilkan sisa utang per supplier dan per PO, serta jatuh tempo berdasarkan termin.
- PO dapat diunduh sebagai PDF dan dikirim lewat email atau dibagikan sebagai tautan baca saja.

### 6.4 Penjualan sederhana

- Catat penjualan: tanggal, lokasi, item, jumlah, harga jual, diskon, metode pembayaran (teks bebas dari daftar yang diatur Owner), pelanggan opsional.
- Penjualan mengurangi stok pada lokasi yang dipilih dengan aturan yang sama seperti stok keluar.
- Pembatalan penjualan membuat transaksi pembalik, bukan menghapus.
- Impor penjualan dari CSV dengan validasi per baris.
- Laba kotor dihitung dari harga jual dikurangi harga pokok rata-rata bergerak pada saat penjualan (bagian 7).

### 6.5 Pengeluaran operasional

- Tanggal, kategori, deskripsi, nominal, referensi, lampiran foto atau PDF, pembuat.
- Kategori bisa diatur Owner dan Admin.
- Pembelian barang lewat PO tidak dicatat ulang sebagai pengeluaran. Sistem menolak penautan ganda dan menampilkan peringatan bila kategori pengeluaran mirip dengan pembelian stok.

### 6.6 Laporan

Laporan yang tersedia di 1.0:

- Posisi stok per produk dan lokasi, nilai persediaan.
- Pergerakan stok, penyesuaian, dan hasil stok opname.
- Pembelian per periode, supplier, dan status PO.
- Utang supplier dan umur utang.
- Penjualan per periode, produk, dan lokasi.
- Laba kotor per produk dan periode.
- Pengeluaran per kategori dan periode.
- Ringkasan bulanan untuk pemilik: penjualan, pembelian, pengeluaran, laba kotor, dan selisih stok opname.

Semua laporan bisa difilter, diekspor ke CSV dan XLSX, dan dicetak. Ekspor mengikuti filter dan izin pengguna. Setiap laporan menampilkan definisi metriknya di bawah judul.

### 6.7 Dashboard

- Kartu: produk aktif, stok rendah, PO belum selesai, utang jatuh tempo, penjualan periode, pembelian periode.
- Grafik: tren penjualan dan pembelian, pergerakan stok, distribusi status stok. Setiap grafik punya ringkasan teks dan tabel data yang bisa dibuka.
- Daftar tindakan: produk yang perlu dibeli, PO menunggu persetujuan, utang jatuh tempo, produk mendekati kedaluwarsa.
- Filter periode dan lokasi memperbarui semua kartu dan tabel.
- Data kosong menampilkan penjelasan dan tombol langkah berikutnya, tidak menampilkan angka contoh.

### 6.8 Impor dan ekspor

- Impor produk, supplier, saldo awal, dan penjualan dari CSV atau XLSX. Template yang bisa diunduh tersedia untuk tiap jenis.
- Berkas divalidasi sebelum disimpan. Pratinjau menampilkan jumlah baris valid dan daftar baris bermasalah beserta alasannya. Impor berjalan penuh atau tidak sama sekali, dan hasilnya bisa dibatalkan dalam 24 jam bila belum ada transaksi turunan.
- Ekspor seluruh data workspace dalam CSV oleh Owner kapan saja, tanpa biaya tambahan.

### 6.9 Notifikasi

- Email dan notifikasi di aplikasi untuk: stok rendah, PO menunggu persetujuan, PO disetujui atau ditolak, utang jatuh tempo, undangan, aktivitas keamanan akun.
- Ringkasan harian opsional. Setiap pengguna bisa mengatur jenis notifikasi sendiri.

### 6.10 Langganan dan penagihan

- Pilih, naikkan, dan turunkan paket sendiri dari Pengaturan. Penurunan paket yang melewati batas ditolak dengan penjelasan apa yang perlu dikurangi.
- Pembayaran lewat satu payment gateway Indonesia (Midtrans atau Xendit, dipilih sebelum pengembangan) dengan QRIS, virtual account, dan kartu.
- Faktur dalam PDF per pembayaran, dengan identitas penjual dan pembeli. Perlakuan pajak atas langganan dikonfirmasi ke konsultan pajak sebelum rilis.
- Masa uji coba paket berbayar tanpa kartu. Setelah uji coba berakhir tanpa pembayaran, workspace turun ke paket Gratis. Data tidak dihapus, hanya fitur di atas batas yang dikunci menjadi baca saja.
- Pengingat perpanjangan lewat email tujuh hari dan satu hari sebelum jatuh tempo.
- Kontrol keamanan dasar (MFA, audit log dasar, backup) tersedia di semua paket.

## 7. Aturan bisnis dan definisi metrik

| Istilah | Definisi |
| --- | --- |
| Metode persediaan | Rata-rata bergerak per produk per workspace. Dihitung ulang setiap penerimaan barang. |
| Nilai persediaan | Saldo stok dikali harga pokok rata-rata saat ini. |
| Pembelian | Total nilai PO yang diterima pada periode, setelah retur. |
| Pengeluaran | Biaya operasional di luar pembelian barang dagangan. |
| Penjualan | Total nilai penjualan yang tidak dibatalkan pada periode, setelah diskon. |
| Laba kotor | Penjualan dikurangi harga pokok barang yang terjual. |
| Utang supplier | Nilai penerimaan dikurangi retur dan pembayaran yang tercatat. |

Laporan tidak menampilkan laba bersih. Pengeluaran ditampilkan terpisah dari laba kotor, dengan catatan bahwa Sahabat UMKM bukan pengganti akuntansi.

## 8. Peran dan izin

| Kemampuan | Owner | Admin | Purchasing | Staf | Viewer |
| --- | --- | --- | --- | --- | --- |
| Langganan, faktur, hapus workspace | Ya | Tidak | Tidak | Tidak | Tidak |
| Anggota dan peran | Ya | Sebagian | Tidak | Tidak | Tidak |
| Produk dan lokasi | Ya | Ya | Lihat | Lihat | Lihat |
| Input stok dan penjualan | Ya | Ya | Tidak | Ya | Tidak |
| Stok opname | Ya | Ya | Tidak | Hitung saja | Tidak |
| Supplier dan PO | Ya | Ya | Ya | Tidak | Lihat |
| Setujui PO | Ya | Ya | Sesuai aturan | Tidak | Tidak |
| Laporan keuangan dan ekspor | Ya | Ya | Pembelian saja | Tidak | Sesuai izin |
| Audit log | Ya | Ya | Tidak | Tidak | Tidak |

Izin diperiksa di server untuk setiap endpoint dan setiap objek. Menyembunyikan tombol di tampilan bukan kontrol keamanan. Pengguna tidak bisa menaikkan peran sendiri. Perubahan peran dan tindakan sensitif masuk audit log.

## 9. Keamanan dan privasi

Autentikasi dan sesi:

- Password disimpan dengan Argon2id. Cek terhadap daftar password yang sudah bocor saat mendaftar dan mengganti password.
- Reset password memakai token acak, kedaluwarsa, sekali pakai. Respons tidak membuka apakah email terdaftar.
- Pembatasan percobaan masuk per akun dan per alamat IP, dengan pemantauan.
- MFA dengan aplikasi autentikator tersedia untuk semua pengguna dan diwajibkan untuk Owner dan Admin pada 30 hari setelah akun dibuat.
- Cookie sesi HttpOnly, Secure, SameSite. Sesi diputar ulang setelah masuk dan setelah perubahan izin.

Isolasi data:

- Semua data bisnis terikat workspace. Server memeriksa keanggotaan pada setiap permintaan. ID dari browser bukan bukti izin.
- Query, pencarian, ekspor, impor, dan berkas menerapkan batas workspace. Constraint database mencegah relasi lintas workspace.
- Tes otomatis wajib mencoba mengakses objek milik workspace lain (IDOR) dan harus gagal.

Aplikasi dan API:

- Validasi di server, prepared statement atau ORM aman, output encoding, Content Security Policy, perlindungan CSRF, CORS terbatas, batas laju, batas ukuran berkas.
- Pesan error tidak menampilkan stack trace atau informasi internal.
- Operasi yang bisa menggandakan efek (penerimaan, pembayaran, impor) memakai kunci idempotency.

Data, backup, dan insiden:

- TLS di semua koneksi. Enkripsi saat disimpan untuk database, berkas, dan backup. Secret tidak ada di repositori atau kode frontend.
- Audit log mencatat pelaku, workspace, waktu, tindakan, objek, dan hasil, tanpa password atau token.
- Backup otomatis harian, terenkripsi, dengan uji pemulihan terjadwal tiap bulan.
- Prosedur insiden tertulis: deteksi, penahanan, pemberitahuan pelanggan terdampak dan pihak berwenang sesuai UU Pelindungan Data Pribadi, evaluasi pasca-insiden.
- Kebijakan privasi menjelaskan data yang dikumpulkan, tujuan, lama simpan, dan cara pengguna meminta akses atau penghapusan data. Perjanjian pemrosesan data tersedia bagi pelanggan yang memintanya.
- Kami tidak mengklaim sertifikasi (misalnya ISO 27001) sebelum sertifikasinya dimiliki.

## 10. UI/UX dan desain visual

Arah desain: bersih, padat informasi, dan mudah dibaca pemilik usaha yang bukan orang teknis. Identitas visual dipegang oleh satu aksen hijau kebiruan dan satu gaya angka tabular. Tidak ada gradasi dekoratif, ikon generik, atau lencana tanpa fungsi.

| Token | Nilai | Penggunaan | Kontras |
| --- | --- | --- | --- |
| Primary | #172B4D | Navigasi, judul | 14,10:1 di putih |
| Secondary | #0B7A6B | Tombol utama, tautan, aksi positif | 5,24:1 dengan teks putih |
| Accent | #F5B544 | Isian sorotan dengan teks #17212F | 8,94:1 |
| Background | #F7F9FC | Latar aplikasi |  |
| Surface | #FFFFFF | Kartu dan panel |  |
| Teks utama | #17212F | Isi | 15,37:1 di background |
| Teks sekunder | #475569 | Keterangan | 7,18:1 di background |
| Sukses | #15803D | Status, selalu dengan teks atau ikon | 5,02:1 di putih |
| Peringatan | #B45309 | Status, selalu dengan teks atau ikon | 5,02:1 di putih |
| Bahaya | #B91C1C | Status, selalu dengan teks atau ikon | 6,47:1 di putih |

Aturan warna: aksen kuning tidak dipakai sebagai warna teks di atas putih (1,81:1). Batas input dan komponen memakai #8A94A6 atau lebih gelap agar mencapai 3:1. Setiap pasangan warna baru wajib dihitung rasio kontrasnya sebelum dipakai.

Tata letak:

- Desktop: sidebar, bilah atas, breadcrumb, judul halaman, aksi utama di kanan atas, tabel dengan filter dan pagination.
- Ponsel: navigasi bawah untuk Dashboard, Stok, Pembelian, Penjualan, Lainnya. Tombol aksi utama selalu terjangkau ibu jari. Tabel berubah menjadi daftar kartu dengan kolom terpenting saja dan tombol untuk membuka detail.
- Form input stok di ponsel: maksimal tiga isian terlihat tanpa menggulir (produk, jumlah, alasan), bidang angka memunculkan papan angka, dan bidang yang sedang diisi tidak tertutup keyboard.
- Target sentuh minimal 44 x 44 px. Tidak ada gulir horizontal pada halaman. Tabel lebar bergulir di dalam wadahnya sendiri.
- Angka rata kanan, huruf angka tabular, format Rupiah dan tanggal konsisten (Rp1.250.000; 9 Okt 2026).
- Setiap tampilan data punya tiga keadaan: memuat (dengan teks), kosong (dengan penjelasan dan langkah berikutnya), dan galat (apa yang terjadi dan apa yang bisa dilakukan).
- Tindakan yang tidak bisa dibatalkan meminta konfirmasi yang menyebut objeknya.
- Aplikasi dapat dipasang sebagai PWA. Halaman daftar produk dan formulir input stok yang sudah dimuat tetap bisa dibuka saat sinyal hilang, dan input yang dibuat saat offline masuk antrean dengan status terlihat jelas serta tidak pernah dianggap berhasil sebelum server mengonfirmasi.

Aksesibilitas (target WCAG 2.2 AA):

- Seluruh fungsi bisa dioperasikan dengan keyboard. Fokus selalu terlihat dengan kontras minimal 3:1. Dialog bisa ditutup dengan Escape.
- Status tidak hanya dibedakan lewat warna.
- Label form terhubung ke bidangnya, pesan galat terbaca pembaca layar.
- Teks bisa diperbesar sampai 200% tanpa terpotong.
- Setiap grafik punya ringkasan teks dan tabel data.
- Tema gelap hanya dirilis bila seluruh komponen diuji di kedua tema. Bila belum, rilis 1.0 memakai tema terang saja.

Font: Inter atau setara, dengan hierarki ukuran yang konsisten dan ukuran dasar teks isi minimal 16 px.

## 11. Situs publik dan konversi

Struktur beranda, berurutan:

1. Header: logo, Fitur, Untuk usaha F&B dan retail, Harga, Masuk, tombol Buat Akun Gratis.
2. Hero: judul, satu kalimat penjelasan, dua tombol, dan tangkapan layar dashboard asli dengan data contoh yang diberi label.
3. Masalah yang dikenali pemilik usaha: stok di buku, belanja lewat chat, rekap di akhir bulan.
4. Cara kerja setiap modul dengan tangkapan layar nyata, jumlah bagian mengikuti jumlah modul, bukan pola tetap.
5. Contoh alur untuk kedai kopi, warung makan, dan toko retail, ditulis sebagai skenario dan bukan sebagai testimoni.
6. Harga yang sama dengan halaman Harga.
7. Pertanyaan umum yang benar-benar ditanyakan calon pelanggan: apakah data bisa diekspor, bagaimana jika sinyal hilang, apakah ini pengganti akuntansi, di mana data disimpan.
8. Footer dengan Privasi, Syarat, Refund, Status, Kontak.

Contoh copy:

- Judul: Stok, pembelian, dan laporan usaha di satu tempat.
- Penjelasan: Catat barang masuk dan keluar, buat pesanan ke supplier, dan lihat laporan bulanan tanpa rekap manual di spreadsheet.
- Tombol utama: Buat Akun Gratis. Tombol kedua: Lihat Demo Produk.
- Tagline: Catat rapi, belanja tepat.

Aturan bukti: tidak ada testimoni, logo pelanggan, jumlah pengguna, klaim penghematan, atau sertifikasi sebelum ada yang nyata dan bisa diverifikasi. Bila belum ada, bagian itu tidak dibuat. Tidak ada kata seperti "revolusioner", "mulus", atau "canggih". Setiap kalimat harus menyebut apa yang dikerjakan produk.

SEO dan kinerja: metadata dan data terstruktur per halaman, peta situs, robots, tautan kanonik, gambar berformat modern dengan dimensi tetap.

## 12. Onboarding dan aktivasi

- Alur: daftar, verifikasi email, buat workspace, isi nama dan jenis usaha, pilih cara memasukkan produk (impor, manual, atau pakai contoh yang jelas diberi label dan bisa dihapus sekali klik), atur stok awal dan batas minimum, catat transaksi pertama, dashboard.
- Setiap langkah opsional bisa dilewati dan ditemukan lagi lewat daftar periksa di dashboard.
- Template impor dengan contoh isi, dan pesan galat impor menyebut nomor baris serta cara memperbaikinya.
- Tur singkat per modul saat pertama dibuka, bisa ditutup dan dipanggil ulang dari menu bantuan.

## 13. Arsitektur dan model data

Arsitektur: frontend responsif (PWA), API backend, autentikasi, database relasional, antrean tugas untuk impor, ekspor, dan email, penyimpanan objek untuk berkas, pemantauan dan pencatatan log. Modular monolith. Usulan stack: React dengan TypeScript, Tailwind CSS, backend yang dikuasai tim, PostgreSQL, hosting terkelola dengan wilayah Indonesia atau Asia Tenggara. Stack final dipilih berdasarkan kemampuan tim dan biaya, dan harus ditetapkan sebelum pengembangan.

Entitas inti: User, Workspace, Membership, Role, Location, Product, Category, StockMovement, StockAdjustment, StockCount, StockCountItem, Supplier, PurchaseOrder, PurchaseOrderItem, PurchaseOrderRevision, GoodsReceipt, GoodsReceiptItem, PurchaseReturn, SupplierPayment, Customer, Sale, SaleItem, Expense, ImportJob, AuditLog, Subscription, Invoice, Notification.

Integritas stok:

- Setiap perubahan stok adalah baris ledger yang tidak bisa diubah. Saldo diperbarui dalam satu transaksi database yang sama dengan ledger.
- Penguncian pada tingkat baris atau kontrol konkurensi optimistis mencegah lost update dan stok negatif.
- Penerimaan, pembayaran, dan impor memakai kunci idempotency yang disimpan.
- Koreksi dibuat sebagai transaksi baru.

## 14. Kinerja, keandalan, dan operasional

| Aspek | Target awal | Cara ukur |
| --- | --- | --- |
| LCP halaman publik | 2,5 detik atau kurang | Pemantauan laboratorium dan data pengguna nyata |
| INP aplikasi | 200 ms atau kurang | Data pengguna nyata |
| CLS | 0,1 atau kurang | Data pengguna nyata |
| Waktu simpan transaksi stok | 1 detik atau kurang di persentil ke-95 | Metrik API |
| Ketersediaan | 99,5% per bulan | Pemantau eksternal |
| RPO | 24 jam atau kurang | Dibuktikan lewat uji restore |
| RTO | 4 jam atau kurang | Dibuktikan lewat uji restore |

Target ketersediaan, RPO, dan RTO baru boleh ditulis di halaman harga atau kontrak setelah tiga bulan data pemantauan dan satu uji restore berhasil. Sebelum itu, halaman Status Layanan menampilkan data nyata tanpa janji kontraktual.

Pemantauan mencakup galat, latensi, ketersediaan, kegagalan tugas latar, dan kegagalan pembayaran. Peringatan dikirim ke penanggung jawab jaga. Tabel besar memakai pagination, dan kueri dashboard dihitung di server dengan indeks yang sesuai.

## 15. Dukungan pelanggan dan kesiapan bisnis

- Pusat Bantuan berisi panduan per modul dan penyelesaian masalah umum, ditulis dalam Bahasa Indonesia.
- Dukungan lewat email dan formulir di dalam aplikasi, ditambah WhatsApp Business untuk paket berbayar. Jam layanan dan target waktu respons ditulis di halaman Kontak setelah tim dukungan ditetapkan, bukan sebelumnya.
- Halaman Status Layanan dan pemberitahuan gangguan lewat email.
- Dokumen hukum yang ditinjau penasihat hukum sebelum rilis: Syarat dan Ketentuan, Kebijakan Privasi, Kebijakan Refund, Perjanjian Pemrosesan Data.
- Badan usaha penjual, rekening penerima, dan kewajiban pajak atas langganan sudah ditetapkan.
- Kebijakan refund: ditetapkan tertulis, ditampilkan di halaman Harga dan saat checkout.
- Pencatatan tiket dukungan dan label penyebab, dikaji mingguan untuk memperbaiki produk dan bantuan.
- Panduan internal untuk menangani permintaan penghapusan data, pemulihan akun, dan pengembalian dana.

## 16. Paket dan harga

Harga di bawah adalah usulan awal untuk diuji kesediaan membayarnya pada 5 sampai 10 pemilik usaha di segmen pertama sebelum rilis. Angka final ditetapkan setelah uji itu.

|  | Gratis | Usaha | Bisnis |
| --- | --- | --- | --- |
| Harga usulan per bulan | Rp0 | Rp99.000 | Rp249.000 |
| Produk aktif | 100 | 1.000 | 10.000 |
| Anggota | 2 | 5 | 15 |
| Lokasi | 1 | 2 | 5 |
| PO dan penerimaan | Ya | Ya | Ya |
| Penjualan sederhana | Tidak | Ya | Ya |
| Retur dan utang supplier | Tidak | Ya | Ya |
| Stok opname | Tidak | Ya | Ya |
| Ekspor | CSV | CSV dan XLSX | CSV dan XLSX |
| Approval PO berjenjang | Tidak | Tidak | Ya |
| Riwayat audit log | 30 hari | 90 hari | 12 bulan |
| Dukungan | Pusat Bantuan dan email | Email dan WhatsApp | Prioritas |

- Pembayaran tahunan diusulkan setara 10 bulan.
- Harga belum termasuk pajak yang berlaku.
- MFA, enkripsi, backup, isolasi data, dan ekspor seluruh data tersedia di semua paket dan tidak dijadikan fitur berbayar.
- Setiap batas paket diuji di server dan menampilkan pesan yang menyebut batasnya dan cara menaikkan paket.

## 17. Pengujian dan kriteria siap jual

Jenis pengujian:

- Unit: saldo stok, rata-rata bergerak, total PO, utang, status, izin, batas paket.
- Integrasi: PO ke penerimaan ke stok, retur, penjualan ke stok dan laba kotor, impor, ekspor, pembayaran, isolasi workspace.
- Ujung ke ujung: alur 1 sampai 6 pada bagian 3 di desktop dan ponsel, termasuk uji peran Viewer.
- Keamanan: bypass otorisasi, IDOR, XSS, CSRF, injeksi, batas laju, sesi, request ganda, input stok bersamaan, kebocoran secret, pemindaian dependensi, dan uji penetrasi oleh pihak yang bukan pengembang produk.
- Aksesibilitas: pemeriksaan otomatis ditambah uji manual dengan keyboard dan pembaca layar pada alur utama.
- Kinerja: uji beban pada ukuran data yang mewakili paket Bisnis.
- Uji penerimaan pengguna dengan sedikitnya lima pemilik usaha dari segmen pertama.

Definition of Done tiap fitur: kriteria fungsi terpenuhi, validasi dan otorisasi di server diuji, keadaan memuat, kosong, sukses, dan galat tersedia, berjalan di ponsel, tes lulus, tidak ada secret di repositori, dokumentasi dan bantuan diperbarui.

Produk boleh dijual dan ditagih bila semua butir ini benar:

- Skenario 1 sampai 6 selesai tanpa bantuan tim oleh pengguna uji.
- Tidak ada temuan keamanan tingkat tinggi atau kritis yang terbuka.
- Tes isolasi workspace berjalan otomatis dan lulus di setiap build.
- Uji restore backup berhasil dan waktunya tercatat.
- Pembayaran sungguhan dari awal sampai faktur berhasil, termasuk gagal bayar dan perpanjangan.
- Dokumen hukum terbit dan kebijakan refund terlihat sebelum pembayaran.
- Pusat Bantuan mencakup semua modul, dan jalur dukungan sudah dijaga oleh orang yang ditunjuk.
- Halaman publik tidak memuat klaim, angka, atau testimoni yang tidak bisa dibuktikan.
- Pemeriksaan kontras dan keyboard pada alur utama lulus.

## 18. Rencana setelah rilis

| Versi | Fokus |
| --- | --- |
| 1.1 | Pemindaian barcode lewat kamera, tema gelap bila sudah diuji penuh, ekspor terjadwal |
| 1.2 | Transfer stok antar-lokasi dengan status transit, retur penjualan |
| 1.3 | API publik dan webhook untuk paket Bisnis |
| Menyusul | Integrasi marketplace atau bank, bergantung pada permintaan pelanggan yang tercatat |

Urutan didasarkan pada permintaan yang tercatat dari tiket dukungan dan wawancara pelanggan, bukan tebakan.

## 19. Metrik keberhasilan

| Metrik | Target awal | Cara ukur |
| --- | --- | --- |
| Onboarding selesai | 70% atau lebih | Pengguna yang menyelesaikan langkah pembuatan produk dan stok awal |
| Transaksi pertama dalam 24 jam | 60% atau lebih | Event di aplikasi |
| Waktu input stok | 1 menit atau kurang | Uji tugas dengan pengguna nyata |
| Retensi hari ke-7 dan ke-30 | 30% atau lebih untuk hari ke-7 | Pengguna aktif yang kembali |
| Konversi Gratis ke berbayar | Ditetapkan setelah tiga bulan data | Langganan aktif dibanding workspace aktif |
| Biaya hosting dan dukungan per workspace berbayar | Dipantau bulanan terhadap harga paket | Laporan biaya |
| Tiket dukungan per 100 workspace aktif | Dipantau, dikurangi lewat perbaikan produk | Sistem tiket |

Angka di atas adalah target awal, bukan klaim. Hasil aktual tidak ditampilkan ke publik sebelum bisa diverifikasi.

## 20. Risiko dan keputusan yang perlu disahkan

Risiko:

- Kesalahan saldo menurunkan kepercayaan. Mitigasi: ledger tidak bisa diubah, uji konkurensi dan idempotency di setiap build.
- Kebocoran antar-workspace. Mitigasi: tes otomatis, uji penetrasi, dan tinjauan keamanan sebelum rilis.
- Laporan dianggap akuntansi. Mitigasi: definisi metrik tampil di setiap laporan dan tidak ada label laba bersih.
- Biaya dukungan dan hosting tumbuh lebih cepat dari pendapatan. Mitigasi: pantau biaya per workspace, batas paket di server.
- Pengguna offline membuat data ganda. Mitigasi: antrean dengan idempotency dan status terlihat.

Keputusan yang dibutuhkan sebelum pengembangan, dengan usulan bawaan:

| Keputusan | Usulan bawaan |
| --- | --- |
| Domain dan merek final "Sahabat UMKM" | Periksa ketersediaan domain dan merek dagang sebelum desain logo |
| Payment gateway | Pilih Midtrans atau Xendit berdasarkan biaya dan dukungan QRIS |
| Stack dan hosting | Sesuai bagian 13, dikunci setelah pembuktian konsep alur stok dan penerimaan |
| Metode persediaan | Rata-rata bergerak (sudah ditetapkan di bagian 7) |
| Batas dan harga paket | Sesuai bagian 16, diuji sebelum dikunci |
| Penanggung jawab dukungan dan jam layanan | Ditunjuk sebelum rilis, jam layanan ditulis setelahnya |
| Badan usaha penjual dan perlakuan pajak | Dikonfirmasi ke konsultan pajak dan penasihat hukum |
