import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * `npm test` memakai PGlite sehingga tidak butuh server database.
 * `npm run test:postgres` menjalankan proyek postgres, yang membutuhkan
 * TEST_DATABASE_URL dan memang dapat menguji dua koneksi bersamaan (PRD 6.2).
 *
 * `@vitejs/plugin-react` dipasang di sini karena `apps/web/tsconfig.json` menyetel
 * `jsx` ke `preserve` supaya Next.js yang memproses JSX. Vitest tidak memakai
 * Next.js, dan transformasi esbuild-nya membiarkan nilai tsconfig itu apa adanya,
 * sehingga komponen `.tsx` ditolak di tahap import-analysis dengan pesan "invalid JS
 * syntax" padahal berkasnya benar. Tanpa plugin ini, satu-satunya berkas web yang
 * bisa diuji adalah berkas tanpa JSX, dan bagian bersama seperti penomoran halaman
 * ikut di luar jangkauan tes.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/api/test/**/*.test.ts',
            // Komponen web diuji sebagai berkas .tsx, jadi kedua pola diperlukan.
            'apps/web/test/**/*.test.ts',
            'apps/web/test/**/*.test.tsx',
          ],
          environment: 'node',
          // Setiap berkas tes memakai PGlite sendiri, jadi penyiapan skema perlu
          // waktu lebih dari default 10 detik ketika banyak berkas berjalan
          // bersamaan.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Folder terpisah, bukan pola nama berkas, karena vitest memberikan tiap
        // berkas kepada proyek pertama yang cocok. Pola yang lebih luas di proyek
        // unit akan mengambil alih berkas ini.
        test: {
          name: 'postgres',
          include: ['packages/db/test-postgres/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // TEST_DATABASE_URL menunjuk satu database, bukan satu per berkas, dan
          // salah satu berkas membersihkan skema public di akhir. Kalau keduanya
          // jalan bersamaan, salah satunya menghapus objek yang sedang dipakai
          // yang lain.
          fileParallelism: false,
        },
      },
    ],
  },
})