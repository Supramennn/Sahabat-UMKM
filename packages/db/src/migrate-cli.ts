import { createPostgresDatabase, migrate } from './index.ts'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL belum diisi. Salin .env.example ke .env lalu isi nilainya.')
  process.exit(1)
}

const db = createPostgresDatabase(connectionString)
try {
  const result = await migrate(db)
  if (result.applied.length === 0) {
    console.log(`Tidak ada migrasi baru. ${result.alreadyApplied.length} migrasi sudah dipakai.`)
  } else {
    console.log(`Migrasi diterapkan: ${result.applied.join(', ')}`)
  }
} catch (error) {
  console.error('Migrasi gagal:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.close()
}
