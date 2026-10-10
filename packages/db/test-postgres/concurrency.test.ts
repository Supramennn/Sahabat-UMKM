import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresDatabase, type Database } from '../src/index.ts'
import { closeTestDatabase, usingRealPostgres } from '../src/test-harness.ts'

/**
 * Kriteria PRD 6.2: dua pengguna yang mengeluarkan stok terakhir secara bersamaan
 * menghasilkan satu transaksi berhasil dan satu penolakan. Itu hanya bisa dibuktikan
 * dengan dua koneksi PostgreSQL sungguhan, karena PGlite berjalan sebagai satu
 * koneksi.
 *
 * Berkas ini menguji mekanisme pengunciannya secara terpisah dari alur stok, yang
 * diuji di stock-concurrency.test.ts.
 *
 * Catatan: berkas ini sama sekali belum pernah dijalankan sampai September 2026,
 * karena mesin pengembangan tidak punya PostgreSQL. Ketika akhirnya dijalankan,
 * tes pertamanya terbukti salah: ia membuka transaksi kedua di dalam transaksi
 * pertama yang masih memegang kunci, jadi ia mengunci dirinya sendiri dan selalu
 * berakhir dengan batas waktu. Tesnya ditulis ulang supaya dua transaksi berjalan
 * di dua koneksi berbeda.
 */

const connectionString = process.env.TEST_DATABASE_URL

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe.skipIf(!usingRealPostgres())('penguncian baris pada dua koneksi', () => {
  let db: Database
  let koneksiKedua: Database

  beforeAll(async () => {
    db = createPostgresDatabase(connectionString!, 5)
    koneksiKedua = createPostgresDatabase(connectionString!, 1)

    await db.exec(`
      create table if not exists lock_probe (
        id bigint primary key,
        n bigint not null
      )
    `)
    await db.query('delete from lock_probe')
    await db.query('insert into lock_probe (id, n) values (1, 1)')
  })

  afterAll(async () => {
    await db.exec('drop table if exists lock_probe')
    await koneksiKedua.close()
    await db.close()
  })

  it('menahan transaksi kedua sampai transaksi pertama selesai', async () => {
    const urutan: string[] = []

    // Dua instance Database berarti dua kumpulan koneksi, jadi kedua transaksi ini
    // benar-benar berjalan bersamaan di koneksi yang berbeda.
    const pertama = db
      .transaction(async (tx) => {
        await tx.lockRow('select n from lock_probe where id = 1 for update')
        await sleep(300)
      })
      .then(() => urutan.push('pertama'))

    await sleep(50)

    const kedua = koneksiKedua
      .transaction(async (tx) => {
        await tx.lockRow('select n from lock_probe where id = 1 for update')
      })
      .then(() => urutan.push('kedua'))

    await Promise.all([pertama, kedua])

    // Kunci baru dilepas setelah transaksi pertama selesai, jadi transaksi kedua
    // tidak mungkin lebih dulu. Inilah yang mencegah dua orang menghabiskan stok
    // terakhir pada saat bersamaan.
    expect(urutan).toEqual(['pertama', 'kedua'])
  })

  it('membiarkan beberapa transaksi menaikkan nilai secara berurutan tanpa kehilangan perubahan', async () => {
    const increment = (database: Database) =>
      database.transaction(async (tx) => {
        const current = await tx.lockRow<{ n: string }>(
          'select n from lock_probe where id = 1 for update',
        )
        await sleep(20)
        await tx.query('update lock_probe set n = $1 where id = 1', [
          Number(current.rows[0]!.n) + 1,
        ])
      })

    await Promise.all([increment(db), increment(koneksiKedua), increment(db)])

    const hasil = await db.query<{ n: string }>('select n from lock_probe where id = 1')
    expect(Number(hasil.rows[0]!.n)).toBe(4)
  })
})

describe('pengujian konkurensi', () => {
  it.skipIf(usingRealPostgres())('dilewati karena tidak ada PostgreSQL sungguhan', () => {
    expect(usingRealPostgres()).toBe(false)
  })

  it('menjelaskan cara menjalankannya', () => {
    expect(closeTestDatabase).toBeTypeOf('function')
  })
})
