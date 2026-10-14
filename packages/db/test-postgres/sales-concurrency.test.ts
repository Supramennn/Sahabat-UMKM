import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresDatabase, type Database } from '../src/index.ts'
import { migrate } from '../src/migrate.ts'
import { usingRealPostgres } from '../src/test-harness.ts'
import { recordMovement } from '../../../apps/api/src/stock/movements.ts'
import { createSale } from '../../../apps/api/src/sales/service.ts'

/**
 * PRD 6.4: penjualan mengurangi stok pada lokasi yang dipilih dengan aturan yang sama
 * seperti stok keluar. Yang diuji di sini bukan hanya penguncian baris, melainkan
 * alur penjualan penuh: dua kasir menjual barang terakhir pada saat bersamaan.
 *
 * Kalau penjualan punya jalur penguncian sendiri, pengujian ini akan gagal, dan itu
 * memang yang dicek: penjualan harus melewati recordMovement.
 */

const connectionString = process.env.TEST_DATABASE_URL

describe.skipIf(!usingRealPostgres())('konkurensi penjualan (PRD 6.4)', () => {
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
       values ($1, 'hash', 'Kasir', now())
       returning id`,
      [`konkurensi-jual-${sequence}@contoh.test`],
    )
    const userId = user.rows[0]!.id

    const workspace = await db.query<{ id: number }>(
      'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
      [`konkurensi-jual-${sequence}`, 'Toko Konkurensi Jual', userId],
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
      [workspaceId, 'Kios'],
    )
    const locationId = location.rows[0]!.id

    const product = await db.query<{ id: number }>(
      `insert into products (workspace_id, sku, name, unit_code, selling_price)
       values ($1, 'KONK-JUAL', 'Kopi Uji', 'pcs', 45000)
       returning id`,
      [workspaceId],
    )
    const productId = product.rows[0]!.id
    await db.query('insert into product_costs (workspace_id, product_id) values ($1, $2)', [
      workspaceId,
      productId,
    ])

    if (quantity > 0) {
      await db.transaction(async (tx) => {
        await recordMovement(tx, {
          workspaceId,
          productId,
          locationId,
          kind: 'masuk',
          direction: 'tambah',
          quantity,
          unitCost: 30_000,
          reasonCode: 'pembelian',
          occurredOn: '2026-10-10',
          actorUserId: userId,
        })
      })
    }

    return { workspaceId, productId, locationId, userId }
  }

  function jual(
    context: { workspaceId: number; productId: number; locationId: number; userId: number },
    quantity: number,
    idempotencyKey: string,
  ): Promise<{ ok: boolean; message: string }> {
    return db
      .transaction((tx) =>
        createSale(tx, {
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          soldOn: '2026-10-10',
          locationId: context.locationId,
          paymentMethodLabel: 'Tunai',
          items: [{ productId: context.productId, quantity, unitPrice: 45_000 }],
          idempotencyKey,
        }),
      )
      .then((result) => ({ ok: true, message: result.number }))
      .catch((error: unknown) => ({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }))
  }

  it('membiarkan satu penjualan berhasil dan menolak yang lain saat barang terakhir terjual bersamaan', async () => {
    const context = await seed(1)

    const [pertama, kedua] = await Promise.all([
      jual(context, 1, `konkurensi-jual-a-${sequence}`),
      jual(context, 1, `konkurensi-jual-b-${sequence}`),
    ])

    const berhasil = [pertama, kedua].filter((hasil) => hasil.ok)
    const ditolak = [pertama, kedua].filter((hasil) => !hasil.ok)

    expect(berhasil).toHaveLength(1)
    expect(ditolak).toHaveLength(1)
    expect(ditolak[0]!.message).toContain('Kopi Uji')
    expect(ditolak[0]!.message).toContain('Kios')

    const penjualan = await db.query<{ total: number }>(
      'select count(*)::int as total from sales where workspace_id = $1',
      [context.workspaceId],
    )
    expect(Number(penjualan.rows[0]!.total)).toBe(1)

    const saldo = await db.query<{ quantity: string }>(
      'select quantity from stock_balances where product_id = $1',
      [context.productId],
    )
    expect(Number(saldo.rows[0]!.quantity)).toBe(0)
  })

  it('memastikan penjualan yang gagal tidak meninggalkan baris penjualan atau baris setengah jadi', async () => {
    const context = await seed(1)

    await Promise.all([
      jual(context, 1, `konkurensi-sisa-a-${sequence}`),
      jual(context, 1, `konkurensi-sisa-b-${sequence}`),
    ])

    const penjualan = await db.query<{ total: number }>(
      'select count(*)::int as total from sale_items where workspace_id = $1',
      [context.workspaceId],
    )
    const movements = await db.query<{ total: number }>(
      `select count(*)::int as total from stock_movements
        where workspace_id = $1 and product_id = $2 and kind = 'keluar'`,
      [context.workspaceId, context.productId],
    )

    // Satu penjualan yang berhasil berarti tepat satu baris item dan satu baris ledger
    // keluar. Kalau transaksi yang gagal meninggalkan sisipan, jumlahnya lebih dari itu.
    expect(Number(penjualan.rows[0]!.total)).toBe(1)
    expect(Number(movements.rows[0]!.total)).toBe(1)
  })

  it('memberi nomor penjualan yang berbeda untuk setiap transaksi yang berhasil', async () => {
    const context = await seed(10)

    const hasil = await Promise.all([
      jual(context, 1, `konkurensi-nomor-a-${sequence}`),
      jual(context, 1, `konkurensi-nomor-b-${sequence}`),
      jual(context, 1, `konkurensi-nomor-c-${sequence}`),
    ])

    const nomor = hasil.filter((item) => item.ok).map((item) => item.message)
    expect(nomor).toHaveLength(3)
    expect(new Set(nomor).size).toBe(3)
  })
})