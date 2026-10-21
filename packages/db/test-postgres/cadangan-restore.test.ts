import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buatCadangan,
  muatCadanganDariBerkas,
  pulihkanCadangan,
  simpanCadangan,
  verifikasiPulihan,
  type CadanganTerbuat,
} from '../src/cadangan.ts'
import { siapkanDataUjiCadangan } from '../src/uji-cadangan.ts'
import { createPostgresDatabase, migrate, type Database } from '../src/index.ts'
import { usingRealPostgres } from '../src/test-harness.ts'

/**
 * Kriteria PRD 17 dan PRD 14: cadangan baru berlaku bila restore-nya berhasil
 * dan waktunya tercatat, bukan sekadar berkas yang terbentuk. Ujinya
 * round-trip penuh: cadangkan database berisi alur bisnis dan jenis kolom
 * yang paling mudah salah dibaca (numeric NaN, bytea, jsonb, timestamptz
 * mikrodetik), pulihkan ke database lain di klaster yang sama, lalu pastikan
 * database hasil pemulihan menghasilkan cadangan yang identik per pernyataan.
 *
 * Tes ini dijalankan bersama `npm run test:postgres:local`, yang menghidupkan
 * klaster PostgreSQL tertanam di `.pgdata` dan menyetel TEST_DATABASE_URL.
 */

const connectionString = process.env.TEST_DATABASE_URL

describe.skipIf(!usingRealPostgres())('cadangan dan pemulihan lewat uji restore', () => {
  let sumber: Database
  let target: Database
  let cadangan: CadanganTerbuat
  let idWorkspace: number

  beforeAll(async () => {
    sumber = createPostgresDatabase(connectionString!, 5)
    await migrate(sumber)
    await siapkanDataUjiCadangan(sumber)

    const url = new URL(connectionString!)
    const namaDatabase = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const namaTarget = `${namaDatabase}_cadangan`
    if (!/^[a-z0-9_]+$/.test(namaTarget) || !namaTarget.includes('test')) {
      throw new Error(`Nama database pemulihan tidak aman untuk uji: ${namaTarget}`)
    }
    if (!/test/i.test(new URL(connectionString!).pathname)) {
      throw new Error(
        'TEST_DATABASE_URL tidak menunjuk database pengujian. Nama database harus memuat kata "test".',
      )
    }

    // Database tes ini dipakai bergantian antar berkas, jadi skemanya
    // dipulihkan ke keadaan bersih sebelum migrasi dan seed.
    await sumber.exec('drop schema public cascade; create schema public;')
    await migrate(sumber)
    await siapkanDataUjiCadangan(sumber)

    const ada = await sumber.query<{ count: number }>(
      'select count(*)::int as count from pg_database where datname = $1',
      [namaTarget],
    )
    if (Number(ada.rows[0]?.count ?? 0) === 0) {
      await sumber.query(`create database ${namaTarget}`)
    }

    const urlTarget = new URL(connectionString!)
    urlTarget.pathname = `/${namaTarget}`
    target = createPostgresDatabase(urlTarget.toString(), 5)
    await target.exec('drop schema public cascade; create schema public;')
    await migrate(target)
    // Cadangan bersifat data-only: skema dari migrations, isi dari berkas.
    // Tabel di luar migrasi seperti cadangan_probe dibuat penanamnya di dua
    // database supaya dump bisa membawanya penuh. Isi target tersapu oleh
    // pemuatan cadangan, jadi tidak ada duplikasi.
    await siapkanDataUjiCadangan(target)
  })

  afterAll(async () => {
    if (target) await target.close()
    await sumber.exec('drop schema public cascade; create schema public;')
    await sumber.close()
  })

  it('membuat cadangan yang berkasnya terbaca sama persis', async () => {
    cadangan = await buatCadangan(sumber)
    expect(cadangan.pernyataan.length).toBeGreaterThan(0)
    expect(cadangan.waktu.total).toBeGreaterThan(0)
    expect(cadangan.waktu.katalog).toBeGreaterThan(0)
    expect(cadangan.waktu.data).toBeGreaterThan(0)

    const idRs = await sumber.query<{ id: number }>(
      'select id from workspaces order by id limit 1',
    )
    idWorkspace = idRs.rows[0]!.id

    const berkas = join('.tmp', 'uji-restore', 'cadangan-uji.sql')
    await simpanCadangan(berkas, cadangan, 'database uji tertanam')
    const terbaca = await muatCadanganDariBerkas(berkas)
    expect(terbaca.pernyataan).toEqual(cadangan.pernyataan)
    expect(terbaca.dibuat).toEqual(expect.any(String))
  })

  it('memulihkan cadangan ke database lain tanpa perbedaan', async () => {
    const waktu = await pulihkanCadangan(target, cadangan.pernyataan)
    expect(waktu.total).toBeGreaterThan(0)

    const verifikasi = await verifikasiPulihan(sumber, target, cadangan)
    if (!verifikasi.sama) {
      console.error('Pemulihan tidak identik:\n' + verifikasi.selisih?.join('\n'))
    }
    expect(verifikasi.sama).toBe(true)
    // -1 berarti tabel tak terdaftar di salah satu sisi; dianggap gagal supaya
    // tabel yang tertinggal tidak lolos diam-diam.
    for (const tabel of verifikasi.tabel) {
      expect(tabel.sumber, tabel.nama).toBe(tabel.pulih)
      expect(tabel.sumber, tabel.nama).toBeGreaterThanOrEqual(0)
    }
  })

  it('baris bisnis hasil pemulihan sama nilainya dengan sumber', async () => {
    const probeSumber = await sumber.query<{ angka: string; waktu: Date; teks: string }>(
      'select angka::text as angka, waktu, teks from cadangan_probe order by id',
    )
    const probePulih = await target.query<{ angka: string; waktu: Date; teks: string }>(
      'select angka::text as angka, waktu, teks from cadangan_probe order by id',
    )
    expect(probePulih.rows).toEqual(probeSumber.rows)

    const gerakSumber = await sumber.query<{ quantity: string; balance_after: string }>(
      'select quantity::text as quantity, balance_after::text as balance_after from stock_movements order by id',
    )
    const gerakPulih = await target.query<{ quantity: string; balance_after: string }>(
      'select quantity::text as quantity, balance_after::text as balance_after from stock_movements order by id',
    )
    expect(gerakPulih.rows).toEqual(gerakSumber.rows)
  })

  it('sekuens dan ledger terhadap pemulihan alur yang benar', async () => {
    // Kolom identity harus lanjut persis dari nilai maksimum yang dipulihkan.
    const maksLama = await target.query<{ id: string }>(
      'select coalesce(max(id), 0)::text as id from categories',
    )
    const baru = await target.query<{ id: number }>(
      'insert into categories (workspace_id, name) values ($1, $2) returning id',
      [idWorkspace, 'Makanan'],
    )
    expect(Number(baru.rows[0]!.id)).toBe(Number(maksLama.rows[0]!.id) + 1)

    // Sekuens mandiri payment_numbers dipulihkan dengan is_called yang benar,
    // jadi nomor tagihan berikutnya tidak berulang.
    const sekuens = await target.query<{ last_value: string; is_called: boolean }>(
      'select last_value::text as last_value, is_called from payment_numbers',
    )
    expect(Number(sekuens.rows[0]!.last_value)).toBeGreaterThanOrEqual(1)
    expect(sekuens.rows[0]!.is_called).toBe(true)

    // Ledger tetap menolak mutasi di database hasil pemulihan (PRD 13).
    await expect(
      target.exec("update stock_movements set note = 'coba-ubah' where id > 0"),
    ).rejects.toThrow(/tidak dapat diubah/)
  })

  it('trigger tidak menulis ulang hasil pemulihan yang sengaja menyimpang', async () => {
    // Sumber dibuat default_location_id = null. Bila pemulihan menjalankan
    // trigger set_default_location, nilai null akan diisi ulang dan berbeda
    // dari sumber. Dengan trigger dinonaktifkan selama pemuatan, hasil ikut
    // sumber persis, termasuk nilai null-nya.
    await sumber.exec('update workspaces set default_location_id = null')
    const cadanganNol = await buatCadangan(sumber)
    await pulihkanCadangan(target, cadanganNol.pernyataan)

    const pulihNol = await target.query<{ default_location_id: number | null }>(
      'select default_location_id from workspaces',
    )
    expect(pulihNol.rows[0]?.default_location_id ?? null).toBeNull()

    await sumber.exec(
      'update workspaces set default_location_id = (select min(id) from locations)',
    )
  })
})
