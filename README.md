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
| Frontend | Next.js 15, TypeScript, CSS Modules dengan token warna PRD 10 |
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

Tailwind tidak dipakai. Keputusan dan alasannya tercatat di K-16 pada
`docs/KEPUTUSAN-TEKNIS.md`.

## Menjalankan secara lokal

Pengujian otomatis tidak butuh Docker atau server database.

```bash
npm install
npm test
```

Menjalankan aplikasi sendiri butuh PostgreSQL dan MinIO:

```bash
cp .env.example .env
docker compose up -d postgres minio
npm run migrate
npm run dev:api
npm run dev:web
```

Tanpa PostgreSQL, API bisa dijalankan dengan database PGlite dalam memori. Berguna
untuk memeriksa alur autentikasi, tapi data hilang saat proses berhenti.

```bash
npx tsx scripts/dev-api.mts
```

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

## Paket dan langganan

Workspace dimulai pada paket Gratis. Katalog paket, batas produk aktif, anggota,
lokasi, fitur penjualan, retur/utang, opname, dan uji coba 14 hari diterapkan di API;
permintaan bersamaan untuk menambah pemakaian dibatasi dengan kunci workspace.
Workspace baru mendapat baris langganan melalui migrasi database. Harga di katalog
masih usulan PRD, pembayaran dan penagihan belum aktif, dan uji coba tidak memerlukan
kartu. Setelah masa uji coba berakhir, workspace kembali ke Gratis tanpa menghapus
datanya. Fitur yang tidak termasuk paket ditolak pada server, termasuk untuk sesi
opname yang sudah terbuka. Penagihan produksi tetap ditahan sampai harga final,
penjual dan rekening, kewajiban pajak, kebijakan refund, serta dokumen hukum pada
`docs/KEPUTUSAN-TEKNIS.md` dikonfirmasi.

Fase 6 selesai: migrasi dan katalog paket, aktivasi uji coba, downgrade otomatis,
pemeriksaan batas dan fitur di server, serta pengaturan paket. Verifikasi terakhir
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

Penjualan memakai `recordMovement` yang sama dengan stok keluar, jadi penjualan yang
menyentuh barang terakhir menghasilkan satu transaksi berhasil dan satu penolakan,
sama seperti entri stok manual. Harga pokok disimpan sebagai snapshot di setiap baris
penjualan (A-07), jadi laba kotor bulan lalu tidak berubah karena ada pembelian baru.

Halaman `/po/<token>` adalah tampilan publik purchase order. Halamannya tidak punya
sesi, tidak boleh diindeks mesin pencari, dan hanya bisa dibuka selama tautannya
berlaku.

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
