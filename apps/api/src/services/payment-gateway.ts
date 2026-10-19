import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Payment gateway langganan (PRD 6.10, Midtrans per KEPUTUSAN-TEKNIS K-05).
 *
 * Snap dipakai karena satu integrasi sudah mencakup QRIS, virtual account, dan
 * kartu: halaman paket hanya mengarahkan pengguna ke tautan pembayaran yang
 * dikembalikan Midtrans, dan statusnya kembali lewat notifikasi yang
 * ditandatangani. Kunci server hanya ada di environment, tidak pernah dikirim
 * ke peramban.
 */

export interface PaymentTransactionRequest {
  orderId: string
  amount: number
  /** Nama barang yang tampil di halaman pembayaran, misalnya "Paket Usaha, 1 bulan". */
  itemName: string
  payerName: string
  payerEmail: string
  /** Halaman aplikasi yang dibuka setelah pembayaran selesai di Midtrans. */
  finishUrl: string
}

export interface PaymentTransaction {
  token: string
  /** Null pada gateway simulasi: tidak ada halaman pembayaran yang bisa dibuka. */
  redirectUrl: string | null
}

export interface PaymentGateway {
  createTransaction(request: PaymentTransactionRequest): Promise<PaymentTransaction>
}

export interface MidtransConfig {
  serverKey: string
  sandbox: boolean
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const MIDTRANS_HOSTS = {
  sandbox: 'https://app.sandbox.midtrans.com',
  production: 'https://app.midtrans.com',
}

export function createMidtransGateway(config: MidtransConfig): PaymentGateway {
  const host = config.sandbox ? MIDTRANS_HOSTS.sandbox : MIDTRANS_HOSTS.production
  const fetchImpl = config.fetchImpl ?? fetch

  return {
    async createTransaction(request) {
      const response = await fetchImpl(`${host}/snap/v1/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString('base64')}`,
        },
        body: JSON.stringify({
          transaction_details: { order_id: request.orderId, gross_amount: request.amount },
          item_details: [
            { id: request.orderId, name: request.itemName, price: request.amount, quantity: 1 },
          ],
          customer_details: { first_name: request.payerName, email: request.payerEmail },
          callbacks: { finish: request.finishUrl },
        }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      })

      if (!response.ok) {
        // Isi respons tidak ditulis: galat Midtrans bisa memuat detail transaksi.
        throw new Error(`Midtrans menolak permintaan pembayaran (HTTP ${response.status}).`)
      }

      const body = (await response.json()) as { token?: unknown; redirect_url?: unknown }
      if (typeof body.token !== 'string' || typeof body.redirect_url !== 'string') {
        throw new Error('Midtrans tidak mengembalikan tautan pembayaran.')
      }
      return { token: body.token, redirectUrl: body.redirect_url }
    },
  }
}

/**
 * Gateway pengembangan tanpa kunci Midtrans. Tagihan tetap menunggu sampai
 * notifikasi pembayaran yang ditandatangani masuk, jadi alur setelah pembayaran
 * bisa diperiksa tanpa jaringan. Tidak pernah aktif di produksi, lihat
 * `readBillingConfigFromEnv`.
 */
export function createSimulatedGateway(): PaymentGateway {
  return {
    async createTransaction() {
      return { token: 'simulasi', redirectUrl: null }
    },
  }
}

/**
 * Tanda tangan notifikasi Midtrans: SHA-512 dari order_id + status_code +
 * gross_amount + server key. Notifikasi yang tidak cocok ditolak, karena
 * endpoint-nya terbuka tanpa sesi.
 */
export function midtransSignature(input: {
  orderId: string
  statusCode: string
  grossAmount: string
  serverKey: string
}): string {
  return createHash('sha512')
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest('hex')
}

export function midtransSignatureMatches(received: string, expected: string): boolean {
  const kiri = Buffer.from(received, 'utf8')
  const kanan = Buffer.from(expected, 'utf8')
  return kiri.length === kanan.length && timingSafeEqual(kiri, kanan)
}

export type MidtransAction = 'dibayar' | 'gagal' | 'kedaluwarsa' | 'abaikan'

/**
 * Pemetaan status Midtrans ke status pembayaran kita.
 *
 * `capture` baru lunas setelah pemeriksaan penipuan menerima; saat masih
 * ditinjau, notifikasi berikutnya yang menentukan. Refund dan chargeback tidak
 * diurus PRD 6.10, jadi diabaikan dan tetap tercatat untuk pemeriksaan manual.
 */
export function midtransAction(transactionStatus: string, fraudStatus: string | null): MidtransAction {
  switch (transactionStatus) {
    case 'settlement':
      return 'dibayar'
    case 'capture':
      if (fraudStatus === 'accept') return 'dibayar'
      return fraudStatus === 'deny' ? 'gagal' : 'abaikan'
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'gagal'
    case 'expire':
      return 'kedaluwarsa'
    default:
      return 'abaikan'
  }
}
