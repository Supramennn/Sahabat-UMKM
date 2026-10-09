# Catatan Arsitektur

Menjelaskan keputusan yang sudah dijalankan di Fase 0. Untuk keputusan yang masih
usulan dan belum dikunci, lihat `docs/KEPUTUSAN-TEKNIS.md`.

## Bentuk sistem

Modular monolith, sesuai PRD 13. Dua proses yang berjalan terpisah:

| Proses | Peran |
| --- | --- |
| `apps/web` | Frontend. Situs publik dirender di server untuk LCP 2,5 detik, area aplikasi menjadi PWA. |
| `apps/api` | API. Satu proses Fastify, modular per domain. |

Basis data PostgreSQL accessed langsung oleh API. Antrean tugas (impor, ekspor,
email) berjalan di atas PostgreSQL dengan pg-boss agar tidak ada layanan tambahan
yang harus dipantau dan dicadangkan.

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
fungsi `reject_row_mutation()` untuk tabel lain yang butuh aturan sama, terutama
ledger stok pada Fase 2.

## Uang dan waktu

- Uang adalah `BIGINT` rupiah penuh tanpa pecahan, pembulatan setengah ke atas per
  baris. Lihat `KEPUTUSAN-TEKNIS.md` bagian 3.
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

Statusnya per 9 Oktober 2026: tes konkurensi itu belum pernah dijalankan, karena
mesin pengembangan ini tidak punya PostgreSQL yang berfungsi. Laporan Fase 0
mencatatnya sebagai pekerjaan yang belum selesai, bukan sebagai lulus.

## Konfigurasi

Semua nilai rahasia dibaca dari environment. `.env.example` hanya berisi placeholder
dan tidak pernah berisi nilai nyata. Pratinjau konfigurasi ada di `README.md` dan
`.env.example`.
