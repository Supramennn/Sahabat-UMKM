import { createPostgresDatabase } from '@sahabat/db'
import { buildApp } from './app.ts'

// Nilai dari .env dimuat lebih dulu supaya perintah npm, yang berjalan di
// direktori workspace, tetap menemukan berkas di akar repositori. Variabel
// lingkungan yang sudah diisi menang atas isi berkas. Di produksi environment
// datang dari layanan, jadi .env yang tidak ada bukan kesalahan.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
} catch {
  // .env hanya untuk pengembangan lokal.
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error(
    'DATABASE_URL belum diisi. Salin .env.example ke .env dan jalankan PostgreSQL dengan npm run db:up, ' +
      'atau pakai API PGlite tanpa database terpisah: npx tsx scripts/dev-api.mts',
  )
  process.exit(1)
}

const host = process.env.API_HOST || '127.0.0.1'
const portDariEnv = Number.parseInt(process.env.API_PORT || '', 10)
const port = Number.isSafeInteger(portDariEnv) && portDariEnv > 0 ? portDariEnv : 4000
const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX || '', 10)

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET belum diisi. Nilai pengembangan dipakai, jangan pakai di produksi.')
}

const db = createPostgresDatabase(
  connectionString,
  Number.isSafeInteger(poolMax) && poolMax > 0 ? poolMax : 10,
)
const app = await buildApp({ db, logger: true })

try {
  await app.listen({ host, port })
} catch (error) {
  console.error('API gagal dijalankan:', error instanceof Error ? error.message : error)
  await db.close()
  process.exit(1)
}

// Tutup koneksi database saat proses dihentikan supaya PostgreSQL tidak
// menyisakan koneksi menggantung.
const shutdown = async () => {
  await app.close()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
