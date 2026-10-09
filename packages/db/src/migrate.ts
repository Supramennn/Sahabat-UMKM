import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from './client.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export interface MigrationResult {
  applied: string[]
  alreadyApplied: string[]
}

export async function listMigrations(dir = migrationsDir): Promise<string[]> {
  const entries = await readdir(dir)
  return entries.filter((name) => name.endsWith('.sql')).sort()
}

/**
 * Migrasi tidak pernah diubah setelah dipakai. Runner menolak versions yang sudah
 * tercatat dengan isi berbeda, supaya database tidak diam-diam berbeda antar mesin.
 */
export async function migrate(db: Database, dir = migrationsDir): Promise<MigrationResult> {
  await db.exec(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const files = await listMigrations(dir)
  const existing = await db.query<{ version: string }>('select version from schema_migrations')
  const applied = new Set(existing.rows.map((row) => row.version))

  const newlyApplied: string[] = []

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) {
      continue
    }

    const sql = await readFile(join(dir, file), 'utf8')
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into schema_migrations (version) values ($1)', [version])
    })
    newlyApplied.push(version)
  }

  return {
    applied: newlyApplied,
    alreadyApplied: [...applied],
  }
}
