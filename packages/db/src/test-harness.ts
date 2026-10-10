import { createPgliteDatabase, createPostgresDatabase, type Database } from './client.ts'
import { migrate } from './migrate.ts'

/**
 * Database bersih dengan seluruh migrasi sudah dijalankan, untuk satu berkas tes.
 *
 * Default-nya PGlite sehingga `npm test` jalan tanpa server database. Setel
 * TEST_DATABASE_URL untuk menguji terhadap PostgreSQL sungguhan, yang diperlukan
 * oleh tes konkurensi dua koneksi (PRD 6.2). Untuk menjalankan tes itu tanpa
 * Docker, pakai `npm run test:postgres:local`, yang menyalakan klaster PostgreSQL
 * tertanam di `.pgdata` lalu menjalankan proyek postgres di dalamnya.
 */
export async function createTestDatabase(): Promise<Database> {
  const connectionString = process.env.TEST_DATABASE_URL
  const db = connectionString
    ? createPostgresDatabase(connectionString, 5)
    : await createPgliteDatabase()
  await migrate(db)
  return db
}

export function usingRealPostgres(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL)
}

/**
 * Membersihkan database setelah tes. Ini menghapus seluruh skema public, jadi
 * nama database pada TEST_DATABASE_URL wajib memuat kata "test". Tanpa pemeriksaan
 * itu, satu perintah salah ketik akan menghapus database pengembangan.
 */
export async function closeTestDatabase(db: Database): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL ?? ''

  if (usingRealPostgres() && !/\btest\b/i.test(new URL(connectionString).pathname)) {
    throw new Error(
      'TEST_DATABASE_URL tidak menunjuk database pengujian. Nama database harus memuat kata "test".',
    )
  }

  if (usingRealPostgres()) {
    await db.exec('drop schema public cascade; create schema public;')
  }
  await db.close()
}
