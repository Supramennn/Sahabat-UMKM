/**
 * Menjalankan tes konkurensi terhadap PostgreSQL sungguhan tanpa Docker.
 *
 * PRD 6.2 menuntut dua pengguna yang mengeluarkan stok terakhir pada saat bersamaan
 * menghasilkan satu transaksi berhasil dan satu penolakan. PGlite hanya satu
 * koneksi, jadi kriteria itu tidak bisa dibuktikan dengan PGlite. Tes ini karena
 * itu butuh dua koneksi sungguhan.
 *
 * Binari PostgreSQL diambil dari paket embedded-postgres dan disimpan di .pgdata,
 * yang sudah masuk .gitignore. Tidak ada kredensial nyata di sini: yang dipakai
 * hanya untuk mesin lokal.
 *
 * Jalankan: npm run test:postgres:local
 */

import EmbeddedPostgres from 'embedded-postgres'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createPostgresDatabase } from '../packages/db/src/index.ts'

const PORT = 5433
const USER = 'sahabat'
const PASSWORD = 'sahabat'
const DATABASE = 'sahabat_umkm_test'

async function main() {
  const postgres = new EmbeddedPostgres({
    databaseDir: join(process.cwd(), '.pgdata'),
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    onLog: () => {},
    onError: (message) => {
      const text = message instanceof Error ? message.message : String(message)
      if (!text.includes('already in use')) {
        process.stderr.write(`${text}\n`)
      }
    },
  })

  await postgres.initialise().catch(() => {
    // Cluster sudah pernah dibuat di mesin ini, jadi inisialisasi kedua tidak
    // diperlukan dan memang gagal. Itu bukan kondisi yang harus diperbaiki.
  })
  await postgres.start()

  try {
    // Database dibuat lewat klien yang kita buat sendiri dan tutup sendiri.
    // Pembuatan lewat pustaka membiarkan kliennya terbuka, dan klien yang terbuka
    // itu menulis ECONNRESET setelah postgres dimatikan.
    const admin = createPostgresDatabase(`postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres`, 1)
    const ada = await admin.query<{ count: number }>(
      'select count(*)::int as count from pg_database where datname = $1',
      [DATABASE],
    )
    if (Number(ada.rows[0]?.count ?? 0) === 0) {
      await admin.query(`create database ${DATABASE}`)
    }
    await admin.close()

    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'test:postgres'],
      {
        stdio: 'inherit',
        // Windows tidak bisa menjalankan berkas .cmd tanpa shell, dan Node 22
        // menolak spawn seperti itu dengan EINVAL.
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          TEST_DATABASE_URL: `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`,
        },
      },
    )

    const code = await new Promise<number>((resolve) => {
      child.on('close', (exitCode) => resolve(exitCode ?? 1))
    })

    process.exitCode = code
  } finally {
    await postgres.stop().catch(() => {})
  }

  // Klaster sudah dimatikan. Keluar sekarang supaya tidak ada yang menulis
  // pesan di luar hasil tes.
  process.exit(process.exitCode ?? 0)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
