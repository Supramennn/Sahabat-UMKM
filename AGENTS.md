# Sahabat UMKM, panduan untuk agen

Aplikasi web untuk mencatat stok, mengelola pembelian ke supplier, mencatat penjualan,
dan membaca laporan usaha UMKM.

## Baca ini lebih dulu

1. `docs/PRD-Sahabat-UMKM.md` adalah sumber kebenaran produk. PRD menang bila ada
   pertentangan dengan asumsi apa pun.
2. `docs/KEPUTUSAN-TEKNIS.md` mencatat keputusan yang PRD delegasikan ke tim, lengkap
   dengan alasannya, plus daftar ambiguitas A-01 sampai B-13 dan penghalang rilis yang
   belum bisa diselesaikan dengan kode.
3. `docs/ARSITEKTUR.md` menjelaskan bentuk sistem dan alasan di balik pilihan teknis.

## Aturan yang tidak boleh dilanggar

Integritas data lebih penting daripada kecepatan.

- Ledger stok tidak dapat diubah atau dihapus. Koreksi selalu dibuat sebagai baris baru.
- Saldo diperbarui dalam satu transaksi database yang sama dengan baris ledger, dengan
  penguncian tingkat baris.
- Stok negatif ditolak. Transaksi yang gagal tidak boleh mengubah saldo.
- Penerimaan, pembayaran, dan impor memakai kunci idempotency yang disimpan.
- Setiap query dan endpoint dibatasi ke workspace dan memeriksa izin di server.
  Menyembunyikan tombol bukan kontrol keamanan.
- Tabel turunan memakai foreign key komposit `(id, workspace_id)` supaya referensi lintas
  workspace mustahil terjadi di level database.
- Setiap fitur baru ditulis bersama tesnya, dan Definition of Done di PRD 17 dipenuhi.
- Tes akses lintas workspace harus ada dan gagal dengan benar sejak Fase 1.

## Aturan bahasa dan bukti

- Teks antarmuka dan copy memakai Bahasa Indonesia dengan sapaan "Anda".
- Tidak ada testimoni, jumlah pengguna, logo pelanggan, angka, atau klaim keamanan yang
  tidak dapat diverifikasi. Kalau belum ada buktinya, bagian itu tidak dibuat.
- Tidak ada fitur di luar PRD. Usulan tambahan selalu diajukan lebih dulu beserta alasannya.
- Tidak ada secret di repositori. Semua nilai rahasia dari environment.

## Perintah

`npm run verify` menjalankan lint, typecheck, dan tes. `npm test` tidak butuh Docker
maupun server database.

## Fase

Kerjaan berjalan per fase. Laporan tiap fase memuat apa yang selesai, bagian PRD yang
dipenuhi, tes yang dijalankan beserta hasilnya, apa yang belum selesai atau menyimpang,
dan keputusan yang dibutuhkan.

## Status fase

Fase 0 fondasi, Fase 1 autentikasi dan UI, Fase 2 stok, Fase 3 pembelian, Fase 4
penjualan, Fase 5 pengeluaran operasional, Fase 6 paket, batas paket, uji coba,
dan langganan, Fase 7 laporan dan ekspor, serta Fase 8 dashboard selesai. Berikutnya
Fase 9: impor lengkap (XLSX, template, riwayat, pembatalan impor) dengan PRD 6.8.

Urutan fase yang tersisa, supaya tidak ada tumpang tindih:

| Fase | Isi | PRD |
| --- | --- | --- |
| 8 | Dashboard | 6.7 |
| 9 | Impor lengkap: XLSX, template, riwayat, pembatalan impor | 6.8 |
| 10 | Notifikasi email dan di dalam aplikasi | 6.9 |
| 11 | Penagihan dan faktur PDF | 6.10 |
| 12 | Situs publik, pusat bantuan, status, kontak | 11, 15 |
| 13 | PWA, antrean offline, daftar periksa aktivasi | 10, 12 |

Cara menjalankan semuanya tercantum di README.md. Perintah yang dipakai sebelum
menyerahkan hasil: npm run verify, npm run test:contrast, npm run test:postgres:local,
dan npm run test:e2e.

Tes konkurensi bisa dijalankan tanpa Docker lewat `npm run test:postgres:local`,
yang menyalakan klaster PostgreSQL tertanam di `.pgdata`.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or after it is done.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
<!-- antislop:end -->
