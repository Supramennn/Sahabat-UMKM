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
4. `DESIGN.md` adalah arah desain antarmuka (PRD 10 dan keputusan K-19): palet, tipografi,
   gerak, dan aturan pemakaian Tailwind.

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

Kalau satu unit pekerjaan sudah selesai dan verifikasinya lulus, langsung commit dan
push tanpa menunggu persetujuan ulang.

## Fase

Kerjaan berjalan per fase. Laporan tiap fase memuat apa yang selesai, bagian PRD yang
dipenuhi, tes yang dijalankan beserta hasilnya, apa yang belum selesai atau menyimpang,
dan keputusan yang dibutuhkan.

## Status fase

Fase 0 fondasi, Fase 1 autentikasi dan UI, Fase 2 stok, Fase 3 pembelian, Fase 4
penjualan, Fase 5 pengeluaran operasional, Fase 6 paket, batas paket, uji coba,
dan langganan, Fase 7 laporan dan ekspor, Fase 8 dashboard, Fase 9 impor
lengkap (XLSX, template, riwayat, pembatalan impor), Fase 10 notifikasi
email dan di dalam aplikasi (PRD 6.9), serta Fase 11 penagihan dan faktur PDF
(PRD 6.10) selesai.

Fase 12 sedang berjalan: bagian yang sudah selesai adalah beranda produksi
(`apps/web/src/app/page.tsx` + `apps/web/src/lib/beranda.ts`, tangkapan layar data
contoh di `apps/web/public/beranda`, robots.txt, sitemap.xml, dan
`scripts/beranda-gambar.mts` untuk memotret ulang). Sisa Fase 12: halaman fitur
(satu halaman per modul), Untuk usaha F&B dan retail, Harga, Pusat Bantuan,
halaman Status Layanan, Kontak, dan dokumen kebijakan (privasi, syarat, refund)
dengan PRD 11 dan 15; halaman yang belum ada tidak boleh dipasang di menu (PRD 5),
dan tombol "Lihat Demo Produk" menunggu workspace contoh (B-13).

Penagihan sengaja mati sampai kunci Midtrans, identitas penjual, dan tautan kebijakan
refund diisi lewat environment; selama itu kosong, tombol bayar tidak muncul dan
paket berbayar tetap hanya bisa diuji 14 hari. Rinciannya di K-21
`docs/KEPUTUSAN-TEKNIS.md`, termasuk penghalang uji pembayaran sungguhan.

Urutan fase yang tersisa, supaya tidak ada tumpang tindih:

| Fase | Isi | PRD |
| --- | --- | --- |
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
