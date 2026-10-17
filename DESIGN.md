# DESIGN.md — arah desain Sahabat UMKM

Sumber arah: `docs/PRD-Sahabat-UMKM.md` bagian 10, diputuskan ulang pada 17 Oktober 2026
(perubahan UI, K-19 di `docs/KEPUTUSAN-TEKNIS.md`). Dokumen ini cara membacanya saat menulis
kode; PRD tetap menang bila ada pertentangan.

## Identitas

- Sahabat UMKM adalah alat pembukuan usaha kecil, bukan produk konsumen. Sifatnya: tenang,
  rapi, dipercaya, dan padat informasi.
- Pembacanya pemilik usaha yang bukan orang teknis, sering dari ponsel, satu tangan.
- Kalimat arah: "buku besar yang rapi" — angka tabular, garis data halus, satu aksen hijau
  kebiruan, latar tenang, dan kartu yang punya kedalaman lewat bayangan tipis, bukan hiasan.
- Dial: ENERGY 2, RHYTHM 2, MOTION 2. Tidak ada gradasi dekoratif, tidak ada efek kaca,
  tidak ada ikon generik, tidak ada lencana tanpa fungsi.

## Palet

Hanya kelas warna dari tema Tailwind di `apps/web/src/styles/globals.css`. Nilainya milik
`packages/design-tokens`; menambah warna berarti menambah token lebih dulu. Tidak ada nilai
heksadesimal langsung di JSX, dalam bentuk apa pun.

| Kelas | Dipakai untuk |
| --- | --- |
| `bg-primary`, `text-primary` | Navigasi, judul |
| `bg-secondary`, `text-secondary` | Tombol utama, tautan, aksi positif |
| `bg-secondary-deep` | Hover tombol utama |
| `bg-accent`, `text-text-on-accent` | Isian sorotan saja, tidak pernah teks di atas putih |
| `bg-background` | Latar aplikasi |
| `bg-surface` | Kartu dan panel |
| `text-text-primary`, `text-text-secondary` | Isi dan keterangan |
| `text-success`, `text-warning`, `text-danger` | Status, selalu bersama teks atau ikon |
| `bg-danger-surface`/`text-danger-ink`, `bg-success-surface`/`text-success-ink` | Pesan galat dan sukses |
| `border-border-strong` | Batas kontrol: isian, tombol sekunder |
| `border-border-subtle` | Pemisah dan batas kartu (dekoratif) |
| `bg-disabled-background`, `text-on-primary-muted` | Tombol mati, keterangan di bilah atas |

## Tipografi

- Font: Inter atau setara (stack di tema). Ukuran dasar isi 16 px, line-height 1.5.
- Judul halaman: `text-2xl font-semibold tracking-tight`. Judul bagian: `text-lg font-semibold`.
- Keterangan: `text-sm` atau `text-[0.9375rem] text-text-secondary`.
- Angka rupiah dan tanggal selalu memakai kelas `tabular` agar kolom lurus.

## Bentuk, elevasi, dan spasi

- Radius: `rounded-control` (isian dan tombol), `rounded-surface` (kartu), `rounded-badge`
  (lencana status).
- Tombol yang tidak bisa dipakai memakai `bg-disabled-background` dengan teks putih supaya
  tetap terbaca; tombol teks yang tidak bisa dipakai memakai `text-text-secondary`.
- Bayangan hanya dua: `shadow-raised` untuk kartu, `shadow-overlay` untuk lapisan yang benar-benar
  melayang (dialog, menu). Tidak ada bayangan lain.
- Spasi mengikuti skala Tailwind: `1`=4 px, `2`=8 px, `3`=12 px, `4`=16 px, `6`=24 px, `8`=32 px,
  `16`=64 px. Susunan dimulai dari ponsel.
- Target sentuh minimal 44 px: `min-h-touch` untuk semua kontrol, termasuk tautan teks.
- Breakpoint: bawaan Tailwind, plus `desktop:` untuk ambang 60rem tempat sidebar muncul dan
  navigasi bawah mati. Tidak ada gulir horizontal di halaman.
- Fokus global sudah 3 px hijau kebiruan (`:focus-visible` di globals.css). Jangan dimatikan.

## Gerak

- Masuk halaman memakai transformasi halus (naik 8 px, 240 ms, kurva `ENTER_EASE`) lewat
  `PageTransition`. Tanpa perubahan opasitas penuh halaman; elemen kecil yang muncul karena
  aksi pengguna boleh opacity dan naik 4 px dengan durasi 180 ms.
- `MotionConfig reducedMotion="user"` mematikan animasi bagi pengguna yang memintanya.
- Tidak ada animasi berulang, parallax, atau efek pegas berlebihan.

## Aturan implementasi

- Komponen bersama ada di `apps/web/src/app/components/ui.tsx`; pakai ulang sebelum menulis baru.
- Kelas kondisional memakai `cx` dari `apps/web/src/lib/cx.ts`.
- Teks antarmuka tetap Bahasa Indonesia dengan sapaan "Anda". Saat memindahkan gaya, jangan
  mengubah copy, struktur semantik, `role`, `aria-*`, atau perilaku.
- Setiap halaman yang pindah ke Tailwind menghapus impor modul CSS-nya; berkas
  `*.module.css` dihapus setelah tidak ada lagi pemakainya.
- Keadaan data selalu punya tiga bentuk: memuat, kosong, dan galat, dengan gaya kartu
  `rounded-surface border border-border-subtle bg-surface p-4 shadow-raised`.

## Daftar periksa sebelum selesai

- `npm run test:contrast` lolos; `npm run verify` lolos; suite E2E aksesibilitas lolos.
- Target sentuh 44 px, fokus terlihat, status tidak hanya dibedakan lewat warna.
- Tidak ada gulir horizontal pada lebar 375 px dan 1440 px.
