import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresDatabase, type Database } from '../src/index.ts'
import { migrate } from '../src/migrate.ts'
import { usingRealPostgres } from '../src/test-harness.ts'
import { recordMovement } from '../../../apps/api/src/stock/movements.ts'

/**
 * Kriteria PRD 6.2: dua pengguna yang mengeluarkan stok terakhir secara bersamaan
 * menghasilkan satu transaksi berhasil dan satu penolakan dengan pesan yang jelas.
 * PGlite berjalan sebagai satu koneksi, jadi kriteria ini hanya bisa dibuktikan di
 * sini, terhadap PostgreSQL sungguhan dengan dua koneksi yang benar-benar berbeda.
 *
 * Yang diuji bukan hanya mekanisme penguncian, melainkan alur lengkap: dua
 * transaksi memanggil recordMovement untuk produk, lokasi, dan stok yang sama pada
 * saat bersamaan. Kalau penguncian baris saldo tidak benar, salah satunya akan
 * berakhir dengan saldo negatif.
 */

const connectionString = process.env.TEST_DATABASE_URL

describe.skipIf(!usingRealPostgres())('penguncian saldo stok (PRD 6.2)', () => {
  let db: Database

  beforeAll(async () => {
    db = createPostgresDatabase(connectionString!, 8)
    await migrate(db)
  })

  afterAll(async () => {
    await db.exec('drop schema public cascade; create schema public;')
    await db.close()
  })

  let sequence = 0

  async function seed(quantity: number): Promise<{
    workspaceId: number
    productId: number
    locationId: number
    userId: number
  }> {
    sequence += 1
    const user = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, 'hash', 'Konkurensi', now())
       returning id`,
      [`konkurensi-${sequence}@contoh.test`],
    )
    const userId = user.rows[0]!.id

    const workspace = await db.query<{ id: number }>(
      `insert into workspaces (slug, name, owner_id)
       values ($1, 'Toko Konkurensi', $2)
       returning id`,
      [`konkurensi-${sequence}`, userId],
    )
    const workspaceId = workspace.rows[0]!.id

    await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      workspaceId,
      userId,
      'owner',
    ])

    const location = await db.query<{ id: number }>(
      'insert into locations (workspace_id, name) values ($1, $2) returning id',
      [workspaceId, 'Gudang'],
    )
    const locationId = location.rows[0]!.id

    const product = await db.query<{ id: number }>(
      `insert into products (workspace_id, sku, name, unit_code)
       values ($1, 'KONK-1', 'Produk Uji', 'pcs')
       returning id`,
      [workspaceId],
    )
    const productId = product.rows[0]!.id

    if (quantity > 0) {
      await db.transaction(async (tx) =>
        recordMovement(tx, {
          workspaceId,
          productId,
          locationId,
          kind: 'masuk',
          direction: 'tambah',
          quantity,
          unitCost: 10_000,
          reasonCode: 'pembelian',
          occurredOn: '2026-10-10',
          actorUserId: userId,
        }),
      )
    }

    return { workspaceId, productId, locationId, userId }
  }

  function keluarStok(
    context: { workspaceId: number; productId: number; locationId: number; userId: number },
    quantity: number,
  ): Promise<{ ok: boolean; message: string }> {
    return db
      .transaction(async (tx) =>
        recordMovement(tx, {
          ...context,
          kind: 'keluar',
          direction: 'kurang',
          quantity,
          reasonCode: 'penjualan',
          occurredOn: '2026-10-10',
        }),
      )
      .then((result) => ({ ok: true, message: String(result.balanceAfter) }))
      .catch((error: unknown) => ({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }))
  }

  it('membiarkan satu transaksi berhasil dan menolak yang lain saat stok terakhir diambil bersamaan', async () => {
    const context = await seed(1)

    const [pertama, kedua] = await Promise.all([keluarStok(context, 1), keluarStok(context, 1)])

    const berhasil = [pertama, kedua].filter((hasil) => hasil.ok)
    const ditolak = [pertama, kedua].filter((hasil) => !hasil.ok)

    expect(berhasil).toHaveLength(1)
    expect(ditolak).toHaveLength(1)
    expect(ditolak[0]!.message).toContain('Produk Uji')
    expect(ditolak[0]!.message).toContain('Gudang')

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [context.productId],
    )
    expect(saldo.rows[0]!.quantity).toBe('0.0000')

    const movements = await db.query<{ total: number }>(
      "select count(*)::int as total from stock_movements where product_id = $1 and kind = 'keluar'",
      [context.productId],
    )
    expect(Number(movements.rows[0]!.total)).toBe(1)
  })

  it('tidak pernah menghasilkan saldo negatif walau lima permintaan berebut dua barang', async () => {
    const context = await seed(2)

    const hasil = await Promise.all([
      keluarStok(context, 1),
      keluarStok(context, 1),
      keluarStok(context, 1),
      keluarStok(context, 1),
      keluarStok(context, 1),
    ])

    expect(hasil.filter((item) => item.ok)).toHaveLength(2)
    expect(hasil.filter((item) => !item.ok)).toHaveLength(3)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [context.productId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(0)
  })

  it('menjaga agar saldo dan penjumlahan ledger selalu sama setelah banyak transaksi bersamaan', async () => {
    const context = await seed(20)

    await Promise.all([
      db.transaction(async (tx) =>
        recordMovement(tx, {
          ...context,
          kind: 'keluar',
          direction: 'kurang',
          quantity: 3,
          reasonCode: 'penjualan',
          occurredOn: '2026-10-10',
        }),
      ),
      db.transaction(async (tx) =>
        recordMovement(tx, {
          ...context,
          kind: 'penyesuaian_naik',
          direction: 'tambah',
          quantity: 5,
          unitCost: 10_000,
          reasonCode: 'rusak',
          occurredOn: '2026-10-10',
        }),
      ),
      db.transaction(async (tx) =>
        recordMovement(tx, {
          ...context,
          kind: 'keluar',
          direction: 'kurang',
          quantity: 8,
          reasonCode: 'penjualan',
          occurredOn: '2026-10-10',
        }),
      ),
    ])

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [context.productId],
    )
    const ledger = await db.query<{ total: string }>(
      `select coalesce(sum(case when direction = 'tambah' then quantity else -quantity end), 0)::text as total
         from stock_movements where product_id = $1`,
      [context.productId],
    )

    expect(saldo.rows[0]!.quantity).toBe(ledger.rows[0]!.total)
    expect(Number(saldo.rows[0]!.quantity)).toBe(20 - 3 + 5 - 8)
  })
})
