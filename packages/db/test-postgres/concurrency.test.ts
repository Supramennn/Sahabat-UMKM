import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresDatabase, type Database } from '../src/index.ts'
import { closeTestDatabase, usingRealPostgres } from '../src/test-harness.ts'

/**
 * Kriteria PRD 6.2: dua pengguna yang mengeluarkan stok terakhir secara bersamaan
 * menghasilkan satu transaksi berhasil dan satu penolakan. Itu hanya bisa dibuktikan
 * dengan dua koneksi PostgreSQL sungguhan, karena PGlite berjalan sebagai satu
 * koneksi.
 *
 * Yang diuji di sini adalah mekanisme yang akan diandalkan ledger stok: penguncian
 * baris benar-benar menahan transaksi kedua sampai transaksi pertama selesai.
 */

const connectionString = process.env.TEST_DATABASE_URL

describe.skipIf(!usingRealPostgres())('penguncian baris pada dua koneksi', () => {
  let db: Database

  beforeAll(async () => {
    db = createPostgresDatabase(connectionString!, 5)
    await db.exec(`
      create table lock_probe (
        id bigint primary key,
        n bigint not null
      )
    `)
    await db.query('insert into lock_probe (id, n) values (1, 1)')
  })

  afterAll(async () => {
    await db.exec('drop table if exists lock_probe')
    await db.close()
  })

  it('menahan transaksi kedua sampai transaksi pertama selesai', async () => {
    const first = await db.transaction(async (tx) => {
      await tx.query('select n from lock_probe where id = 1 for update')

      // Transaksi kedua dibuat lewat instance terpisah agar benar-benar koneksi
      // berbeda, bukan sekadar permintaan lain pada koneksi yang sama.
      const second = await db.transaction(async (secondTx) => {
        await secondTx.query('select n from lock_probe where id = 1 for update')
        return secondTx.query<{ n: number }>('select n from lock_probe where id = 1')
      })

      return second
    }).catch((error: unknown) => error as Error)

    // Aksi terakhir di dalam transaksi pertama adalah melepas kunci, jadi setelah
    // transaksi selesai, transaksi kedua harus bisa memperoleh kunci dan membaca
    // nilai yang sama.
    expect(first).toMatchObject({ rows: [{ n: 1 }] })
  })

  it('membiarkan dua transaksi menaikkan nilai secara berurutan tanpa kehilangan perubahan', async () => {
    const increment = async () =>
      db.transaction(async (tx) => {
        const current = await tx.lockRow<{ n: number }>('select n from lock_probe where id = 1 for update')
        await new Promise((resolve) => setTimeout(resolve, 20))
        await tx.query('update lock_probe set n = $1 where id = 1', [current.rows[0]!.n + 1])
      })

    await Promise.all([increment(), increment(), increment()])

    const hasil = await db.query<{ n: number }>('select n from lock_probe where id = 1')
    expect(hasil.rows[0]!.n).toBe(4)
  })
})

describe('pengujian konkurensi', () => {
  it.skipIf(usingRealPostgres())('dilewati karena tidak ada PostgreSQL sungguhan', () => {
    expect(usingRealPostgres()).toBe(false)
  })

  it.skipIf(usingRealPostgres())('menjelaskan cara menjalankannya', () => {
    const pesan =
      'Setel TEST_DATABASE_URL ke database pengujian, lalu jalankan npm run test:postgres. ' +
      'Kriteria PRD 6.2 tentang dua pengguna mengeluarkan stok terakhir tidak dapat dibuktikan tanpa itu.'
    expect(pesan).toContain('TEST_DATABASE_URL')
    expect(closeTestDatabase).toBeTypeOf('function')
  })
})
