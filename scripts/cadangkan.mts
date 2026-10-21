/**
 * Perkakas pencadangan (PRD 17, PRD 14, bagian 8 docs/KEPUTUSAN-TEKNIS.md).
 *
 * Dua mode:
 *
 *   npm run uji-restore   — berputar penuh: hidupkan klaster PostgreSQL
 *      tertanam di .pgdata-cadangan, isi dua database dengan alur bisnis
 *      contoh, buat cadangan, pulihkan ke database kedua, cocokkan isi
 *      keduanya, lalu catat waktunya ke .tmp/uji-restore/laporan.json.
 *      Penghalang "uji restore backup berhasil dan waktunya tercatat" bisa
 *      dibuktikan di sini tanpa Docker dan tanpa server.
 *
 *   npm run cadangkan     — cadangan logis dari DATABASE_URL ke berkas SQL
 *      di .tmp/cadangan/, untuk dipakai pada server yang memang hidup.
 *
 * Kode inti ada di packages/db/src/cadangan.ts, yang juga diuji di
 * packages/db/test-postgres/cadangan-restore.test.ts bersama
 * `npm run test:postgres:local`.
 */

import EmbeddedPostgres from 'embedded-postgres'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPostgresDatabase, type Database } from '../packages/db/src/index.ts'
import { migrate } from '../packages/db/src/migrate.ts'
import {
  buatCadangan,
  pulihkanCadangan,
  simpanCadangan,
  verifikasiPulihan,
} from '../packages/db/src/cadangan.ts'
import { siapkanDataUjiCadangan } from '../packages/db/src/uji-cadangan.ts'

const PORT_UJI = 5434
const USER = 'sahabat'
const SANDI = 'sahabat'
const DATABASE_SUMBER = 'sahabat_umkm_cadangan_uji'
const DATABASE_SASARAN = 'sahabat_umkm_cadangan_uji_restore'

function sambungkan(namaDatabase: string, jumlahKoneksi = 3): Database {
  return createPostgresDatabase(
    `postgres://${USER}:${SANDI}@127.0.0.1:${PORT_UJI}/${namaDatabase}`,
    jumlahKoneksi,
  )
}

function miliSejak(tanda: bigint): number {
  return Number(process.hrtime.bigint() - tanda) / 1_000_000
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replaceAll(/[:.]/g, '-')
}

function gagal(): void {
  process.exitCode = 1
}

interface Laporan {
  dibuat: string
  berkas: string
  jumlahPernyataan: number
  barisSumber: number
  waktu: {
    buatCadangan: { katalog: number; data: number; total: number }
    pemulihan: { total: number }
    pencocokan: { total: number }
    seluruh: number
  }
  tabel: { nama: string; baris: number }[]
  lulus: boolean
}

async function ujiRestore() {
  const mulaiSeluruh = process.hrtime.bigint()

  const postgres = new EmbeddedPostgres({
    databaseDir: join(process.cwd(), '.pgdata-cadangan'),
    port: PORT_UJI,
    user: USER,
    password: SANDI,
    persistent: true,
    onLog: () => {},
    onError: (message) => {
      const teks = message instanceof Error ? message.message : String(message)
      if (!teks.includes('already in use')) {
        process.stderr.write(`${teks}\n`)
      }
    },
  })
  await postgres.initialise().catch(() => {})
  await postgres.start()

  try {
    const admin = createPostgresDatabase(
      `postgres://${USER}:${SANDI}@127.0.0.1:${PORT_UJI}/postgres`,
      1,
    )
    for (const nama of [DATABASE_SUMBER, DATABASE_SASARAN]) {
      await admin.query(
        `select pg_terminate_backend(pid) from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [nama],
      )
      await admin.query(`drop database if exists ${nama}`)
      await admin.query(`create database ${nama}`)
    }
    await admin.close()

    const sumber = sambungkan(DATABASE_SUMBER)
    const sasaran = sambungkan(DATABASE_SASARAN)

    try {
      await migrate(sumber)
      await siapkanDataUjiCadangan(sumber)
      const cadangan = await buatCadangan(sumber)

      const cadanganBerkas = join('.tmp', 'uji-restore', `cadangan-${stamp()}.sql`)
      await simpanCadangan(cadanganBerkas, cadangan, DATABASE_SUMBER)

      await migrate(sasaran)
      // Cadangan bersifat data-only: skema dibangun migrations, isi dari
      // berkas. Tabel di luar migrasi (cadangan_probe) dibuat penanamnya di
      // database sasaran juga; isinya tersapu oleh pemuatan cadangan.
      await siapkanDataUjiCadangan(sasaran)

      const waktuPulih = await pulihkanCadangan(sasaran, cadangan.pernyataan)
      const verifikasi = await verifikasiPulihan(sumber, sasaran, cadangan)

      const laporan: Laporan = {
        dibuat: new Date().toISOString(),
        berkas: cadanganBerkas,
        jumlahPernyataan: cadangan.pernyataan.length,
        barisSumber: cadangan.barisPerTabel.reduce((total, t) => total + t.baris, 0),
        waktu: {
          buatCadangan: cadangan.waktu,
          pemulihan: waktuPulih,
          pencocokan: verifikasi.waktu,
          seluruh: miliSejak(mulaiSeluruh),
        },
        tabel: cadangan.barisPerTabel.filter((t) => t.baris > 0),
        lulus: verifikasi.sama,
      }

      const laporanBerkas = join('.tmp', 'uji-restore', 'laporan-uji-restore.json')
      await mkdir(join(process.cwd(), '.tmp', 'uji-restore'), { recursive: true })
      await writeFile(laporanBerkas, JSON.stringify(laporan, null, 2), 'utf8')

      console.log(
        `Buat cadangan  : ${Math.round(laporan.waktu.buatCadangan.total)} ms ` +
          `(katalog ${Math.round(laporan.waktu.buatCadangan.katalog)} ms, data ${Math.round(laporan.waktu.buatCadangan.data)} ms)`,
      )
      console.log(
        `Pulihkan       : ${Math.round(laporan.waktu.pemulihan.total)} ms — ${cadangan.pernyataan.length} pernyataan`,
      )
      console.log(
        `Cocokkan       : ${verifikasi.sama ? 'identik per pernyataan' : 'BERBEDA'} (${Math.round(laporan.waktu.pencocokan.total)} ms)`,
      )
      console.log(
        `Baris di sumber: ${laporan.barisSumber} baris pada ${laporan.tabel.length} tabel berguna`,
      )
      console.log(`Berkas cadangan: ${cadanganBerkas}`)
      console.log(`Laporan waktu  : ${laporanBerkas}`)

      if (!verifikasi.sama) {
        process.stderr.write(`Pemulihan tidak identik:\n${verifikasi.selisih?.join('\n')}\n`)
        gagal()
      }
    } finally {
      await sumber.close()
      await sasaran.close()
    }
  } finally {
    await postgres.stop().catch(() => {})
  }
}

async function cadangkan() {
  const url = process.env.DATABASE_URL
  if (!url) {
    process.stderr.write(
      'Setel DATABASE_URL terlebih dahulu, misalnya:\n  set DATABASE_URL=postgres://sahabat:sahabat@127.0.0.1:5433/sahabat_umkm_test\n',
    )
    gagal()
    return
  }

  const mulai = process.hrtime.bigint()
  const db = createPostgresDatabase(url, 2)
  try {
    const namaDatabase = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
    const hasil = await buatCadangan(db)
    const berkas = join(process.cwd(), '.tmp', 'cadangan', `${namaDatabase}-${stamp()}.sql`)
    await simpanCadangan(berkas, hasil, namaDatabase)

    const totalBaris = hasil.barisPerTabel.reduce((total, t) => total + t.baris, 0)
    console.log(`Buat cadangan  : ${Math.round(miliSejak(mulai))} ms`)
    console.log(`Isi cadangan   : ${totalBaris} baris pada ${hasil.barisPerTabel.length} tabel`)
    console.log(`Berkas cadangan: ${berkas}`)
  } finally {
    await db.close()
  }
}

async function main() {
  const perintah = process.argv[2] ?? 'uji'
  if (perintah === 'uji') {
    await ujiRestore()
    return
  }
  if (perintah === 'cadangkan') {
    await cadangkan()
    return
  }
  process.stderr.write(`Perintah tidak dikenal: ${perintah}. Gunakan "uji" atau "cadangkan".\n`)
  gagal()
}

main().catch((pesan: unknown) => {
  process.stderr.write(`${pesan instanceof Error ? pesan.stack : String(pesan)}\n`)
  gagal()
})
