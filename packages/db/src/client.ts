import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'

export interface QueryResult<T> {
  rows: T[]
  affected: number
}

/**
 * Antarmuka SQL minimal yang dipakai seluruh modul. Dua implementasi memenuhi
 * kontrak ini: PostgreSQL sungguhan untuk pengembangan dan produksi, serta PGlite
 * untuk pengujian. Keduanya menerima parameter $1, $2 sehingga tidak ada kueri
 * yang dirangkai dari teks (PRD 9).
 */
export interface Sql {
  query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>
  exec(sql: string): Promise<void>
}

export interface Transaction extends Sql {
  /**
   * Mengunci baris untuk pembaruan sampai transaksi selesai. Ini yang mencegah
   * dua pengguna mengeluarkan stok terakhir pada waktu yang sama (PRD 6.2, PRD 13).
   */
  lockRow<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>
}

export interface Database extends Sql {
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>
  close(): Promise<void>
  driver: 'postgres' | 'pglite'
}

class PostgresTransaction implements Transaction {
  constructor(private readonly client: pg.PoolClient) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query(sql, params as unknown[])
    return { rows: result.rows as T[], affected: result.rowCount ?? 0 }
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql)
  }

  lockRow<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    return this.query<T>(sql, params)
  }
}

class PostgresDatabase implements Database {
  readonly driver = 'postgres' as const

  constructor(private readonly pool: pg.Pool) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params as unknown[])
    return { rows: result.rows as T[], affected: result.rowCount ?? 0 }
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql)
  }

  /**
   * Serialisasi di level database, bukan pengulangan percobaan. Stok tidak boleh
   * pernah negatif walau dua permintaan tiba bersamaan, jadi penguncian baris
   * adalah mekanisme yang benar dan percobaan ulang bukan.
   */
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await fn(new PostgresTransaction(client))
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

class PgliteTransaction implements Transaction {
  constructor(private readonly db: PGlite) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.db.query<T>(sql, params as unknown[])
    return { rows: result.rows, affected: result.affectedRows ?? 0 }
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql)
  }

  lockRow<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    return this.query<T>(sql, params)
  }
}

class PgliteDatabase implements Database {
  readonly driver = 'pglite' as const

  constructor(private readonly db: PGlite) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.db.query<T>(sql, params as unknown[])
    return { rows: result.rows, affected: result.affectedRows ?? 0 }
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql)
  }

  /**
   * PGlite berjalan sebagai satu koneksi, jadi permintaan kedua diblokir.
   * Ini cukup untuk menguji transaksi, rollback, trigger, dan batasan, tetapi
   * tidak untuk menguji dua koneksi berjalan bersamaan. Tes konkurensi memakai
   * PostgreSQL sungguhan lewat createPostgresDatabase.
   */
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    await this.db.exec('begin')
    try {
      const result = await fn(new PgliteTransaction(this.db))
      await this.db.exec('commit')
      return result
    } catch (error) {
      await this.db.exec('rollback').catch(() => {})
      throw error
    }
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}

export function createPostgresDatabase(connectionString: string, max = 10): Database {
  const pool = new pg.Pool({
    connectionString,
    max,
    // Server membatalkan sendiri transaksi yang menggantung, jadi koneksi tidak
    // pernah tertinggal dalam keadaan setengah terpasang.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
  })
  return new PostgresDatabase(pool)
}

export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite()
  await db.waitReady
  return new PgliteDatabase(db)
}
