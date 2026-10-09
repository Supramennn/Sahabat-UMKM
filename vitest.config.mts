import { defineConfig } from 'vitest/config'

/**
 * `npm test` memakai PGlite sehingga tidak butuh server database.
 * `npm run test:postgres` menjalankan proyek postgres, yang membutuhkan
 * TEST_DATABASE_URL dan memang dapat menguji dua koneksi bersamaan (PRD 6.2).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/api/test/**/*.test.ts'],
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
        },
      },
    ],
  },
})
