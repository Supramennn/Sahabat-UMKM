import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/index.ts'
import { closeTestDatabase, createTestDatabase } from '../src/test-harness.ts'

let db: Database

beforeAll(async () => {
  db = await createTestDatabase()
})

afterAll(async () => {
  await closeTestDatabase(db)
})

async function seedWorkspace(name: string): Promise<{ workspaceId: number; userId: number }> {
  return db.transaction(async (tx) => {
    const user = await tx.query<{ id: number }>(
      'insert into users (email, name) values ($1, $2) returning id',
      [`${name.toLowerCase()}@contoh.test`, name],
    )
    const userId = user.rows[0]!.id

    const workspace = await tx.query<{ id: number }>(
      'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
      [name.toLowerCase(), name, userId],
    )
    const workspaceId = workspace.rows[0]!.id

    await tx.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
    await tx.query(
      'insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)',
      [workspaceId, userId, 'owner'],
    )
    return { workspaceId, userId }
  })
}

describe('migrasi 0001_foundation', () => {
  it('mencatat versi migrasi yang sudah diterapkan', async () => {
    const result = await db.query<{ version: string }>('select version from schema_migrations')
    expect(result.rows.map((r) => r.version)).toContain('0001_foundation')
  })

  it('membuat tabel inti PRD 6.1', async () => {
    const result = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )
    const tables = result.rows.map((r) => r.table_name)
    for (const expected of [
      'users',
      'workspaces',
      'workspace_settings',
      'workspace_invitations',
      'memberships',
      'devices',
      'sessions',
      'mfa_secrets',
      'mfa_recovery_codes',
      'idempotency_keys',
      'audit_logs',
      'email_verification_tokens',
      'password_reset_tokens',
    ]) {
      expect(tables).toContain(expected)
    }
  })
})

describe('normalisasi dan validasi email (PRD 6.1)', () => {
  it('menolak email dengan huruf besar', async () => {
    await expect(
      db.query('insert into users (email, name) values ($1, $2)', ['Besar@Contoh.test', 'Besar']),
    ).rejects.toThrow(/users_email_lowercase/)
  })

  it('menolak email tanpa tanda @', async () => {
    await expect(
      db.query('insert into users (email, name) values ($1, $2)', ['bukan-email', 'Tanpa']),
    ).rejects.toThrow(/users_email_shape/)
  })

  it('menolak email yang sama untuk akun lain', async () => {
    await seedWorkspace('Kemail')
    await expect(
      db.query('insert into users (email, name) values ($1, $2)', ['kemail@contoh.test', 'Duplikat']),
    ).rejects.toThrow()
  })
})

describe('peran dan batasan workspace', () => {
  it('menolak peran di luar PRD 8', async () => {
    const { workspaceId, userId } = await seedWorkspace('Peran')
    await expect(
      db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
        workspaceId,
        userId,
        'direktur',
      ]),
    ).rejects.toThrow(/memberships_role/)
  })

  it('mencegah satu workspace punya lebih dari satu Owner', async () => {
    const { workspaceId } = await seedWorkspace('DuaOwner')
    const ownerLain = await db.query<{ id: number }>(
      'insert into users (email, name) values ($1, $2) returning id',
      ['owner2@contoh.test', 'Owner Dua'],
    )
    await expect(
      db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
        workspaceId,
        ownerLain.rows[0]!.id,
        'owner',
      ]),
    ).rejects.toThrow(/memberships_single_owner/)
  })

  it('membolehkan pemilik yang sama memiliki beberapa workspace', async () => {
    const { userId } = await seedWorkspace('BanyakWorkspace')
    const kedua = await db.query<{ id: number }>(
      'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
      ['banyakworkspace-dua', 'Banyak Workspace Dua', userId],
    )
    expect(kedua.rows).toHaveLength(1)
  })

  it('menolak kenaikan peran menjadi owner', async () => {
    const { workspaceId } = await seedWorkspace('NaikPeran')
    const staf = await db.query<{ id: number }>(
      'insert into users (email, name) values ($1, $2) returning id',
      ['staf-naik@contoh.test', 'Staf'],
    )
    const membership = await db.query<{ id: number }>(
      'insert into memberships (workspace_id, user_id, role) values ($1, $2, $3) returning id',
      [workspaceId, staf.rows[0]!.id, 'staff'],
    )
    await expect(
      db.query('update memberships set role = $1 where id = $2', ['owner', membership.rows[0]!.id]),
    ).rejects.toThrow(/tidak dapat dinaikkan menjadi Owner/)
  })

  it('menolak penurunan peran owner', async () => {
    const { workspaceId, userId } = await seedWorkspace('TurunPeran')
    const membership = await db.query<{ id: number }>(
      'select id from memberships where workspace_id = $1 and user_id = $2',
      [workspaceId, userId],
    )
    await expect(
      db.query('update memberships set role = $1 where id = $2', ['admin', membership.rows[0]!.id]),
    ).rejects.toThrow(/peran Owner tidak dapat diubah/)
  })

  it('membolehkan pengangkatan staf menjadi purchasing', async () => {
    const { workspaceId } = await seedWorkspace('NaikStaf')
    const staf = await db.query<{ id: number }>(
      'insert into users (email, name) values ($1, $2) returning id',
      ['staf2@contoh.test', 'Staf Dua'],
    )
    const membership = await db.query<{ id: number }>(
      'insert into memberships (workspace_id, user_id, role) values ($1, $2, $3) returning id',
      [workspaceId, staf.rows[0]!.id, 'staff'],
    )
    await db.query('update memberships set role = $1 where id = $2', [
      'purchasing',
      membership.rows[0]!.id,
    ])
    const after = await db.query<{ role: string }>('select role from memberships where id = $1', [
      membership.rows[0]!.id,
    ])
    expect(after.rows[0]!.role).toBe('purchasing')
  })
})

describe('audit log hanya bertambah (PRD 9)', () => {
  it('menolak penghapusan baris audit', async () => {
    const { workspaceId, userId } = await seedWorkspace('Audit')
    await db.query(
      `insert into audit_logs (workspace_id, actor_user_id, action, object_type, object_id)
       values ($1, $2, $3, $4, $5)`,
      [workspaceId, userId, 'workspace.created', 'workspace', String(workspaceId)],
    )
    await expect(db.exec('delete from audit_logs')).rejects.toThrow(/tidak dapat diubah atau dihapus/)
  })

  it('menolak perubahan isi baris audit', async () => {
    await expect(db.exec("update audit_logs set action = 'dipalsukan'")).rejects.toThrow(
      /tidak dapat diubah atau dihapus/,
    )
  })

  it('menolak hasil yang bukan success, denied, atau failure', async () => {
    await expect(
      db.query('insert into audit_logs (action, result) values ($1, $2)', ['uji', 'entah']),
    ).rejects.toThrow(/audit_logs_result/)
  })
})

describe('idempotency (PRD 9, PRD 13)', () => {
  it('menolak kunci yang sama untuk operasi dan workspace yang sama', async () => {
    const { workspaceId } = await seedWorkspace('Idempoten')
    const key = 'kunci-uji-1'
    await db.query(
      `insert into idempotency_keys (workspace_id, operation, key, request_hash)
       values ($1, $2, $3, $4)`,
      [workspaceId, 'goods_receipt.create', key, 'hash-a'],
    )
    await expect(
      db.query(
        `insert into idempotency_keys (workspace_id, operation, key, request_hash)
         values ($1, $2, $3, $4)`,
        [workspaceId, 'goods_receipt.create', key, 'hash-a'],
      ),
    ).rejects.toThrow()
  })

  it('mengizinkan kunci yang sama untuk operasi berbeda', async () => {
    const { workspaceId } = await seedWorkspace('IdempotenOperasi')
    const key = 'kunci-uji-2'
    await db.query(
      `insert into idempotency_keys (workspace_id, operation, key, request_hash)
       values ($1, $2, $3, $4)`,
      [workspaceId, 'goods_receipt.create', key, 'hash-a'],
    )
    const lain = await db.query(
      `insert into idempotency_keys (workspace_id, operation, key, request_hash)
       values ($1, $2, $3, $4) returning id`,
      [workspaceId, 'supplier_payment.create', key, 'hash-a'],
    )
    expect(lain.rows).toHaveLength(1)
  })
})

describe('transaksi tidak pernah meninggalkan perubahan sebagian (PRD 6.2)', () => {
  it('membatalkan seluruh perubahan bila langkah tengah gagal', async () => {
    const { workspaceId, userId } = await seedWorkspace('Transaksi')

    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `insert into audit_logs (workspace_id, actor_user_id, action)
           values ($1, $2, $3)`,
          [workspaceId, userId, 'langkah.satu'],
        )
        throw new Error('langkah kedua gagal')
      }),
    ).rejects.toThrow('langkah kedua gagal')

    const sisa = await db.query<{ count: number }>(
      'select count(*)::int as count from audit_logs where workspace_id = $1 and action = $2',
      [workspaceId, 'langkah.satu'],
    )
    expect(sisa.rows[0]!.count).toBe(0)
  })
})

describe('kunci idempotensi sesi dan token', () => {
  it('hanya menyimpan hash token sesi', async () => {
    const { userId } = await seedWorkspace('Sesi')
    await db.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '7 days')`,
      [userId, 'hash-token-yang-disimpan'],
    )
    const hasil = await db.query<{ token_hash: string }>('select token_hash from sessions')
    expect(hasil.rows[0]!.token_hash).toBe('hash-token-yang-disimpan')
  })

  it('menolak token reset password yang dipakai dua kali lewat batasan unik', async () => {
    const { userId } = await seedWorkspace('Reset')
    await db.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [userId, 'hash-reset-unik'],
    )
    await expect(
      db.query(
        `insert into password_reset_tokens (user_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 hour')`,
        [userId, 'hash-reset-unik'],
      ),
    ).rejects.toThrow()
  })
})
