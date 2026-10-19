import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { Workbook } from 'exceljs'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider, type EmailProvider } from '../src/services/email.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import { missingHeaders, parseCsv, validateProductRows } from '../src/import/products-csv.ts'

/**
 * PRD 6.8: impor produk dari CSV atau XLSX dengan pratinjau, impor berjalan penuh
 * atau tidak sama sekali, dan hasilnya bisa dibatalkan selama belum ada transaksi
 * turunan (B-04).
 * PRD 3 skenario 1: pemilik mengimpor 200 produk dalam satu sesi.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'

let db: Database
let app: FastifyInstance
let email: EmailProvider

beforeAll(async () => {
  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({ db, email, sessionSecret: 'rahasia-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeTestDatabase(db)
})

let sequence = 0
let passwordHash = ''

async function setupWorkspace(): Promise<{ cookie: string; workspaceId: number }> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const address = `impor-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik Impor', now())
     returning id`,
    [address, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`impor-${sequence}`, `Toko Impor ${sequence}`, user.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query(`insert into workspace_subscriptions (workspace_id, plan_code) values ($1, 'usaha')
    on conflict (workspace_id) do update set plan_code = 'usaha'`, [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    user.rows[0]!.id,
    'owner',
  ])

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })

  return { cookie: cookieOf(login), workspaceId }
}

async function importProduk(
  context: { cookie: string; workspaceId: number },
  content: string,
  idempotencyKey: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}/imports/products`,
    headers: { cookie: context.cookie },
    payload: { content, idempotencyKey },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

async function previewProduk(
  context: { cookie: string; workspaceId: number },
  content: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}/imports/products/preview`,
    headers: { cookie: context.cookie },
    payload: { content, idempotencyKey: 'kunci-pratinjau-yang-cukup-panjang' },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

/** Membuat berkas XLSX asli di memori, supaya jalur baca biner benar-benar diuji. */
async function xlsxBase64(rows: Array<Array<string | number>>): Promise<string> {
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('Impor')
  for (const row of rows) {
    sheet.addRow(row)
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as unknown as ArrayBufferLike).toString('base64')
}

async function postImpor(
  context: { cookie: string; workspaceId: number },
  path: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}${path}`,
    headers: { cookie: context.cookie },
    payload,
  })
  return { statusCode: response.statusCode, body: response.json() }
}

async function daftarImpor(context: { cookie: string; workspaceId: number }) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${context.workspaceId}/imports`,
    headers: { cookie: context.cookie },
  })
  return response.json() as {
    jobs: Array<{
      id: number
      kind: string
      importedRows: number
      status: string
      cancelable: boolean
      cancelBlockedReason: string | null
    }>
  }
}

async function createLocation(context: { workspaceId: number }, name: string): Promise<number> {
  const found = await db.query<{ id: number }>(
    'insert into locations (workspace_id, name) values ($1, $2) returning id',
    [context.workspaceId, name],
  )
  return found.rows[0]!.id
}

describe('membaca CSV', () => {
  it('membaca header, tanda kutip, dan baris kosong di tengah', () => {
    const parsed = parseCsv(
      'sku,nama,satuan\r\n"ABC-1","Kopi, bubuk 250 g",pcs\r\n\r\nABC-2,Gula,kg\r\n',
    )

    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]!.values.nama).toBe('Kopi, bubuk 250 g')
    expect(parsed.rows[1]!.values.sku).toBe('ABC-2')
  })

  it('membaca pemisah titik koma seperti berkas yang disimpan dari Excel', () => {
    const parsed = parseCsv('sku;nama;satuan\nABC-1;Kopi;pcs\n')
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]!.values.nama).toBe('Kopi')
  })

  it('melaporkan baris yang jumlah kolomnya tidak sama', () => {
    const parsed = parseCsv('sku,nama,satuan\nABC-1,Kopi\n')
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.problems[0]!.message).toContain('Jumlah kolom')
  })

  it('menyebut kolom wajib yang hilang', () => {
    const parsed = parseCsv('sku,nama\nABC-1,Kopi\n')
    expect(missingHeaders(parsed.headers)).toEqual(['satuan'])
  })

  it('membaca kolom pertama walaupun ada BOM dari ekspor Excel', () => {
    const parsed = parseCsv('﻿sku,nama,satuan\nABC-1,Kopi,pcs\n')
    expect(missingHeaders(parsed.headers)).toEqual([])
    expect(parsed.rows[0]!.values.sku).toBe('ABC-1')
  })
})

describe('memvalidasi baris (PRD 6.8)', () => {
  it('menolak satuan yang tidak ada di daftar sarat dan menyebut pilihannya', () => {
    const parsed = parseCsv('sku,nama,satuan\nABC-1,Kopi,ton\n')
    const validation = validateProductRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems[0]!.message).toContain('tidak dikenal')
    expect(validation.problems[0]!.message).toContain('pcs')
  })

  it('menandai SKU yang muncul dua kali di berkas yang sama', () => {
    const parsed = parseCsv('sku,nama,satuan\nABC-1,Kopi,pcs\nABC-1,Gula,kg\n')
    const validation = validateProductRows(parsed.rows)

    expect(validation.valid).toHaveLength(1)
    expect(validation.problems[0]!.message).toContain('baris 2')
    expect(validation.duplicateSkus).toEqual(['ABC-1'])
  })

  it('membaca rupiah dan titik sebagai pemisah ribuan', () => {
    const parsed = parseCsv('sku,nama,satuan,harga beli,harga jual,stok minimum\nABC-1,Kopi,pcs,"12.500","Rp15.000",3\n')
    const validation = validateProductRows(parsed.rows)

    expect(validation.valid[0]!.purchasePrice).toBe(12500)
    expect(validation.valid[0]!.sellingPrice).toBe(15000)
    expect(validation.valid[0]!.minStock).toBe(3)
  })

  it('menolak jumlah dengan presisi lebih tinggi dari yang bisa disimpan', () => {
    const parsed = parseCsv('sku,nama,satuan,stok minimum\nABC-1,Kopi,kg,1.234567\n')
    const validation = validateProductRows(parsed.rows)

    expect(validation.valid).toHaveLength(0)
    expect(validation.problems[0]!.message).toContain('Stok minimum')
  })
})

describe('pratinjau impor (PRD 6.8)', () => {
  it('tidak menulis apa pun dan melaporkan jumlah baris valid dan bermasalah', async () => {
    const context = await setupWorkspace()
    const content = 'sku,nama,satuan\nABC-1,Kopi,pcs\nABC-2,Gula,ton\nABC-3,Teh,pcs\n'

    const hasil = await previewProduk(context, content)

    expect(hasil.statusCode).toBe(200)
    expect(hasil.body.totalRows).toBe(3)
    expect(hasil.body.validRows).toBe(2)
    expect(hasil.body.problemRows).toBe(1)
    expect((hasil.body.problems as Array<{ rowNumber: number }>)[0]!.rowNumber).toBe(3)

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from products where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(0)
  })

  it('menolak berkas yang kolom wajibnya kurang', async () => {
    const context = await setupWorkspace()
    const hasil = await previewProduk(context, 'sku,nama\nABC-1,Kopi\n')

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('kolom_wajib_kurang')
    expect(hasil.body.missingHeaders).toEqual(['satuan'])
  })
})

describe('impor produk (PRD 6.8, skenario 1 PRD 3)', () => {
  it('menyimpan semua baris valid beserta kategorinya', async () => {
    const context = await setupWorkspace()
    const content = [
      'sku,nama,kategori,satuan,harga beli,harga jual,stok minimum',
      'KOPI-1,Kopi bubuk 250 g,Minuman,pcs,45000,60000,5',
      'GULA-1,Gula pasir,Minuman,kg,16000,22000,3',
    ].join('\n')

    const hasil = await importProduk(context, content, 'kunci-impor-yang-cukup-panjang-1')

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(2)

    const produk = await db.query<{ sku: string; reference_purchase_price: string; min_stock: string }>(
      'select sku, reference_purchase_price, min_stock from products where workspace_id = $1 order by sku',
      [context.workspaceId],
    )
    expect(produk.rows.map((row) => row.sku)).toEqual(['GULA-1', 'KOPI-1'])
    expect(Number(produk.rows[0]!.reference_purchase_price)).toBe(16000)
    expect(produk.rows[0]!.min_stock).toBe('3.0000')

    // Dua baris dengan kategori sama menghasilkan satu kategori saja.
    const kategori = await db.query<{ count: number }>(
      'select count(*)::int as count from categories where workspace_id = $1',
      [context.workspaceId],
    )
    expect(kategori.rows[0]!.count).toBe(1)
  })

  it('mengimpor 200 baris dalam satu permintaan (skenario 1 PRD 3)', async () => {
    const context = await setupWorkspace()
    const header = 'sku,nama,satuan,harga beli\n'
    const baris = Array.from(
      { length: 200 },
      (_, index) => `SKU-${index + 1},Produk nomor ${index + 1},pcs,${(index + 1) * 1000}`,
    ).join('\n')

    const hasil = await importProduk(context, header + baris, 'kunci-impor-200-baris-panjang')

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(200)
  })

  it('menjalankan atau tidak sama sekali, tidak ada impor separuh', async () => {
    const context = await setupWorkspace()
    const content = 'sku,nama,satuan\nABC-1,Kopi,pcs\nABC-2,Gula,ton\n'

    const hasil = await importProduk(context, content, 'kunci-impor-setengah-panjang')

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('impor_berhenti')
    expect(String(hasil.body.message)).toContain('Tidak ada data yang tersimpan')

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from products where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(0)
  })

  it('melewati SKU yang sudah ada dan menyebut alasannya', async () => {
    const context = await setupWorkspace()
    await importProduk(context, 'sku,nama,satuan\nABC-1,Kopi,pcs\n', 'kunci-impor-awal-panjang')

    const hasil = await importProduk(
      context,
      'sku,nama,satuan\nABC-1,Kopi,pcs\nABC-2,Gula,kg\n',
      'kunci-impor-ulang-panjang',
    )

    expect(hasil.statusCode).toBe(201)
    expect(hasil.body.imported).toBe(1)
    expect(hasil.body.skipped).toBe(1)
    expect(String((hasil.body.skippedRows as Array<{ message: string }>)[0]!.message)).toContain(
      'sudah ada',
    )

    // Produk lama tidak ditulis ulang.
    const produk = await db.query<{ name: string }>('select name from products where sku = $1', [
      'ABC-1',
    ])
    expect(produk.rows[0]!.name).toBe('Kopi')
  })

  it('berkas yang sama yang terkirim dua kali tidak menggandakan produk', async () => {
    const context = await setupWorkspace()
    const content = 'sku,nama,satuan\nABC-1,Kopi,pcs\n'

    const pertama = await importProduk(context, content, 'kunci-idempoten-impor-panjang')
    const kedua = await importProduk(context, content, 'kunci-idempoten-impor-panjang')

    expect(pertama.statusCode).toBe(201)
    expect(kedua.statusCode).toBe(201)
    expect(kedua.body.replayed).toBe(true)

    const tersimpan = await db.query<{ count: number }>(
      'select count(*)::int as count from products where workspace_id = $1',
      [context.workspaceId],
    )
    expect(tersimpan.rows[0]!.count).toBe(1)
  })

  it('menolak impor dari workspace lain', async () => {
    const pemilik = await setupWorkspace()
    const pemobi = await setupWorkspace()

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${pemobi.workspaceId}/imports/products`,
      headers: { cookie: pemilik.cookie },
      payload: { content: 'sku,nama,satuan\nABC-1,Kopi,pcs\n', idempotencyKey: 'kunci-lintas-workspace' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('menolak impor dari peran yang tidak berizin', async () => {
    const context = await setupWorkspace()
    const staf = await db.query<{ id: number }>(
      `insert into users (email, password_hash, name, email_verified_at)
       values ($1, $2, 'Staf Impor', now())
       returning id`,
      [`staf-impor-${sequence}@contoh.test`, passwordHash],
    )
    await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
      context.workspaceId,
      staf.rows[0]!.id,
      'staff',
    ])
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `staf-impor-${sequence}@contoh.test`, password: PASSWORD },
    })

    const hasil = await importProduk(
      { ...context, cookie: cookieOf(login) },
      'sku,nama,satuan\nABC-1,Kopi,pcs\n',
      'kunci-import-staff-panjang',
    )

    expect(hasil.statusCode).toBe(403)
  })
})

describe('impor produk dari XLSX (PRD 6.8)', () => {
  it('membaca berkas XLSX dan menyimpannya sama seperti CSV', async () => {
    const context = await setupWorkspace()
    const contentBase64 = await xlsxBase64([
      ['sku', 'nama', 'satuan', 'harga jual'],
      ['XLSX-1', 'Kopi XLSX', 'pcs', 15000],
      ['XLSX-2', 'Gula XLSX', 'kg', 20000],
    ])

    const preview = await postImpor(context, '/imports/products/preview', {
      contentBase64,
      fileName: 'produk.xlsx',
      idempotencyKey: 'kunci-xlsx-pratinjau-panjang',
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.body.validRows).toBe(2)

    const commit = await postImpor(context, '/imports/products', {
      contentBase64,
      fileName: 'produk.xlsx',
      idempotencyKey: 'kunci-xlsx-simpan-panjang',
    })
    expect(commit.statusCode).toBe(201)
    expect(commit.body.imported).toBe(2)

    const produk = await db.query<{ sku: string; selling_price: string }>(
      "select sku, selling_price from products where workspace_id = $1 and sku like 'XLSX-%' order by sku",
      [context.workspaceId],
    )
    expect(produk.rows.map((row) => row.sku)).toEqual(['XLSX-1', 'XLSX-2'])
    expect(Number(produk.rows[1]!.selling_price)).toBe(20000)
  })

  it('menolak berkas yang dikirim sebagai XLSX padahal isinya bukan XLSX', async () => {
    const context = await setupWorkspace()
    const hasil = await postImpor(context, '/imports/products', {
      contentBase64: Buffer.from('sku,nama,satuan\nABC-1,Kopi,pcs\n', 'utf8').toString('base64'),
      fileName: 'produk.xlsx',
      idempotencyKey: 'kunci-bukan-xlsx-panjang',
    })

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('berkas_bukan_xlsx')
  })
})

describe('kolom stok awal pindah ke impor saldo awal (PRD 6.8)', () => {
  it('menolak berkas barang yang memuat kolom stok awal dan menunjuk halaman yang benar', async () => {
    const context = await setupWorkspace()
    const hasil = await previewProduk(context, 'sku,nama,satuan,stok awal\nABC-1,Kopi,pcs,10\n')

    expect(hasil.statusCode).toBe(400)
    expect(hasil.body.error).toBe('kolom_stok_awal')
    expect(String(hasil.body.message)).toContain('Impor saldo awal')
  })
})

describe('riwayat dan pembatalan impor (PRD 6.8, B-04)', () => {
  it('mencatat impor di riwayat dan membatalkannya selama belum dipakai', async () => {
    const context = await setupWorkspace()
    const content = 'sku,nama,satuan\nBATAL-1,Kopi,pcs\n'
    const commit = await importProduk(context, content, 'kunci-batal-impor-panjang')
    expect(commit.statusCode).toBe(201)
    const jobId = commit.body.importJobId as number

    const riwayat = await daftarImpor(context)
    const job = riwayat.jobs.find((item) => item.id === jobId)
    expect(job?.kind).toBe('produk')
    expect(job?.importedRows).toBe(1)
    expect(job?.status).toBe('selesai')
    expect(job?.cancelable).toBe(true)

    const batal = await postImpor(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(200)
    expect(batal.body.cancelled).toBe(1)

    const produk = await db.query<{ count: number }>(
      'select count(*)::int as count from products where workspace_id = $1',
      [context.workspaceId],
    )
    expect(produk.rows[0]!.count).toBe(0)

    // Setelah dibatalkan, berkas yang sama boleh diimpor lagi.
    const ulang = await importProduk(context, content, 'kunci-batal-impor-ulang')
    expect(ulang.statusCode).toBe(201)
    expect(ulang.body.imported).toBe(1)

    const riwayatSetelah = await daftarImpor(context)
    expect(riwayatSetelah.jobs.find((item) => item.id === jobId)?.status).toBe('dibatalkan')
  })

  it('menolak berkas yang sama sampai impor sebelumnya dibatalkan', async () => {
    const context = await setupWorkspace()
    const content = 'sku,nama,satuan\nGANDA-1,Kopi,pcs\n'
    const pertama = await importProduk(context, content, 'kunci-ganda-pertama-panjang')
    expect(pertama.statusCode).toBe(201)

    const kedua = await importProduk(context, content, 'kunci-ganda-kedua-panjang')
    expect(kedua.statusCode).toBe(409)
    expect(kedua.body.error).toBe('berkas_sudah_diimpor')
  })

  it('tidak bisa dibatalkan ketika barangnya sudah dipakai transaksi', async () => {
    const context = await setupWorkspace()
    const commit = await importProduk(context, 'sku,nama,satuan\nPAKAI-1,Kopi,pcs\n', 'kunci-pakai-impor-panjang')
    const jobId = commit.body.importJobId as number

    // Saldo awal lewat impor membuat satu transaksi stok atas barang itu. Transaksi
    // itulah yang mengunci pembatalan impor barangnya (B-04).
    await createLocation(context, 'Gudang')
    const saldo = await postImpor(context, '/imports/opening-balances', {
      content: 'sku,lokasi,jumlah\nPAKAI-1,Gudang,5\n',
      idempotencyKey: 'kunci-saldo-awal-pakai-panjang',
    })
    expect(saldo.statusCode).toBe(201)

    const riwayat = await daftarImpor(context)
    const job = riwayat.jobs.find((item) => item.id === jobId)
    expect(job?.cancelable).toBe(false)
    expect(String(job?.cancelBlockedReason)).toContain('dipakai transaksi')

    const batal = await postImpor(context, `/imports/${jobId}/cancel`, {})
    expect(batal.statusCode).toBe(409)
    expect(batal.body.error).toBe('impor_tidak_bisa_dibatalkan')

    const produk = await db.query<{ count: number }>(
      'select count(*)::int as count from products where workspace_id = $1',
      [context.workspaceId],
    )
    expect(produk.rows[0]!.count).toBe(1)
  })
})
