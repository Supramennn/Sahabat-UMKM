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

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm test` | Semua tes tanpa server database, memakai PGlite |
| `npm run test:postgres` | Tes yang butuh PostgreSQL sungguhan, setel `TEST_DATABASE_URL` |
| `npm run test:e2e` | Uji ujung ke ujung dengan Playwright |
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
  shared/         matriks izin PRD 8 dan format Rupiah dan tanggal
docs/
  PRD-Sahabat-UMKM.md
  KEPUTUSAN-TEKNIS.md
  ARSITEKTUR.md
```

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
