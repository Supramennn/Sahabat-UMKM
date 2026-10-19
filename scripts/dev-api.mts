/**
 * Menjalankan API dengan database sungguhan untuk pemeriksaan manual.
 *
 * `server.ts` sengaja hanya membaca konfigurasi dari environment, dan
 * `DATABASE_URL` belum diisi di mesin ini karena tidak ada PostgreSQL yang
 * berfungsi. Skrip ini memakai PGlite agar seluruh alur autentikasi dapat
 * dijalankan lewat HTTP nyata tanpa server database terpisah.
 *
 * Jalankan: npx tsx scripts/dev-api.mts
 */

import { createPgliteDatabase, migrate } from '@sahabat/db'
import { createLogEmailProvider } from '../apps/api/src/services/email.ts'
import { startNotificationScheduler } from '../apps/api/src/notifications/daily.ts'
import { buildApp } from '../apps/api/src/app.ts'

// Ikut memuat .env supaya rahasia dan pengaturan penyimpanan lokal dari
// environment terpakai juga di jalur PGlite. DATABASE_URL diabaikan karena
// skrip ini memang memakai database dalam memori.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  // Tanpa .env pun skrip ini jalan dengan nilai pengembangan.
}

const db = await createPgliteDatabase()
await migrate(db)

const email = createLogEmailProvider()
const app = await buildApp({
  db,
  email,
  sessionSecret: process.env.SESSION_SECRET || 'rahasia-pengembangan-manual',
  origin: 'http://localhost:3000',
})

// Penjadwal notifikasi yang sama dengan server produksi, jadi email yang
// menunggu dan tugas harian bisa diamati di jalur PGlite juga. Jeda pengirim
// dipercepat supaya pemeriksaan manual tidak menunggu 15 detik.
const stopNotificationScheduler = startNotificationScheduler({
  db,
  sendEmail: email.send.bind(email),
  webOrigin: 'http://localhost:3000',
  senderIntervalMs: 5_000,
  onError: (error, context) => {
    console.error(`notifikasi gagal (${context}):`, error instanceof Error ? error.message : error)
  },
})

await app.listen({ host: '127.0.0.1', port: 4000 })
console.log('API berjalan di http://127.0.0.1:4000 dengan database PGlite dalam memori')

const shutdown = async () => {
  stopNotificationScheduler()
  await app.close()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
