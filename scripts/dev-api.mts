/**
 * Menjalankan API dengan database sungguhan untuk pemeriksaan manual.
 *
 * `server.ts` sengaja hanya membaca konfigurasi dari environment, dan
 * `DATABASE_URL` belum diisi di mesin ini karena tidak ada PostgreSQL yang
 * berfungsi. Skrip ini memakai PGlite agar seluruh alur autentikasi dapat
 * dijalankan lewat HTTP nyata tanpa server database terpisah.
 *
 * Jalankan: npx tsx scripts/dev-api.mts
 */

import { createPgliteDatabase, migrate } from '@sahabat/db'
import { createLogEmailProvider } from '../apps/api/src/services/email.ts'
import { createSimulatedGateway, type PaymentGateway } from '../apps/api/src/services/payment-gateway.ts'
import { startNotificationScheduler } from '../apps/api/src/notifications/daily.ts'
import { buildApp } from '../apps/api/src/app.ts'

// Ikut memuat .env supaya rahasia dan pengaturan penyimpanan lokal dari
// environment terpakai juga di jalur PGlite. DATABASE_URL diabaikan karena
// skrip ini memang memakai database dalam memori.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  // Tanpa .env pun skrip ini jalan dengan nilai pengembangan.
}

// Penagihan disimulasikan supaya alur setelah pembayaran bisa diperiksa tanpa
// kunci Midtrans: checkout membuat tagihan tanpa tautan bayar, lalu notifikasi
// pembayaran yang ditandatangani dengan kunci di bawah menandainya lunas. Nilai
// kosong di .env dianggap belum diisi, bukan nilai yang dipakai. Tautan
// kebijakan pengembalian dana menunjuk halaman yang baru ada di Fase 12, jadi
// tautannya masih 404 di jalur ini.
function bawaan(nama: string, nilai: string): void {
  if (!process.env[nama]) {
    process.env[nama] = nilai
  }
}

bawaan('PAYMENT_SIMULATION', '1')
bawaan('MIDTRANS_SERVER_KEY', 'kunci-simulasi-pengembangan')
bawaan('BILLING_SELLER_NAME', 'Penjual Contoh (simulasi pengembangan)')
bawaan('BILLING_SELLER_ADDRESS', 'Alamat contoh, hanya untuk simulasi')
bawaan('BILLING_SELLER_EMAIL', 'penjual@contoh.test')
bawaan('BILLING_REFUND_POLICY_URL', 'http://localhost:3000/kebijakan-refund')

const db = await createPgliteDatabase()
await migrate(db)

const email = createLogEmailProvider()

// Gateway simulasi dibungkus pencatat sederhana: nomor pesanan yang dicetak di
// sini yang dipakai untuk mengirim notifikasi pembayaran tiruan saat memeriksa
// alur setelah pembayaran di peramban.
const gatewaySimulasi = createSimulatedGateway()
const gateway: PaymentGateway = {
  async createTransaction(request) {
    const hasil = await gatewaySimulasi.createTransaction(request)
    console.log(`[gateway:simulasi] tagihan ${request.orderId} sebesar ${request.amount} dibuat`)
    return hasil
  },
}

const app = await buildApp({
  db,
  email,
  sessionSecret: process.env.SESSION_SECRET || 'rahasia-pengembangan-manual',
  origin: 'http://localhost:3000',
  paymentGateway: gateway,
})

// Penjadwal notifikasi yang sama dengan server produksi, jadi email yang
// menunggu dan tugas harian bisa diamati di jalur PGlite juga. Jeda pengirim
// dipercepat supaya pemeriksaan manual tidak menunggu 15 detik.
const stopNotificationScheduler = startNotificationScheduler({
  db,
  sendEmail: email.send.bind(email),
  webOrigin: 'http://localhost:3000',
  senderIntervalMs: 5_000,
  onError: (error, context) => {
    console.error(`notifikasi gagal (${context}):`, error instanceof Error ? error.message : error)
  },
})

await app.listen({ host: '127.0.0.1', port: 4000 })
console.log('API berjalan di http://127.0.0.1:4000 dengan database PGlite dalam memori')

const shutdown = async () => {
  stopNotificationScheduler()
  await app.close()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
