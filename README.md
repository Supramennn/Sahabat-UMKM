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
| Frontend | Next.js 15, TypeScript, Tailwind (ditambahkan Fase 5) |
| API | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL 16 |
| Antrean | pg-boss |
| Pengujian | Vitest, Playwright, Testing Library, axe-core |

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
Job `verify` sengaja tidak memorinya.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm test` | Semua tes tanpa server database, memakai PGlite |
| `npm run test:contrast` | Hitung kontras setiap pasangan warna komponen, gagal kalau ada yang di bawah ambang |
| `npm run test:e2e` | Uji aksesibilitas Playwright di ponsel dan desktop. Butuh API dan frontend sudah berjalan |
| `npx tsx scripts/dev-api.mts` | Jalankan API dengan database PGlite dalam memori, untuk pemeriksaan manual tanpa PostgreSQL |
| `npm run test:postgres` | Tes yang butuh PostgreSQL sungguhan, setel `TEST_DATABASE_URL` |
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
| Stok | barang, tambah barang, detail barang, input stok, riwayat, lokasi, kategori, stok opname | 6.2 |

Modul stok memakai satu jalur pencatatan, `recordMovement` di
`apps/api/src/stock/movements.ts`. Tidak ada endpoint lain yang boleh menulis ke
`stock_movements` atau `stock_balances`.

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
