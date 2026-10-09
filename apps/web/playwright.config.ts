import { defineConfig, devices } from '@playwright/test'

/**
 * PRD 17 mewajibkan pemeriksaan aksesibilitas otomatis pada alur utama.
 * Uji ini dijalankan terhadap server produksi, bukan server pengembangan, supaya
 * yang diperiksa sama dengan yang akan dilihat pengguna.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    // Host harus sama dengan WEB_ORIGIN yang diizinkan API. API menolak asal
    // yang tidak terdaftar, jadi menjalankan halaman di 127.0.0.1 sementara API
    // hanya mengizinkan localhost membuat setiap permintaan dari peramban
    // ditolak dan halaman tampak seperti jaringan bermasalah.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'ponsel',
      // Lebar 360 px adalah ponsel sempit yang umum, dipakai untuk memeriksa
      // tidak ada gulir horizontal dan target sentuh tetap terjangkau.
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
