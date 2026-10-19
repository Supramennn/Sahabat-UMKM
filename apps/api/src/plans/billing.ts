import { createMidtransGateway, createSimulatedGateway, type PaymentGateway } from '../services/payment-gateway.ts'

/**
 * Konfigurasi penagihan dari environment (PRD 6.10 dan 15).
 *
 * Pembayaran hanya menyala kalau identitas penjual dan kebijakan pengembalian
 * dana sudah diisi. Faktur tanpa identitas penjual tidak sah, dan PRD 15 meminta
 * kebijakan refund tertulis tampil di halaman Harga dan saat checkout. Selama
 * itu kosong, paket berbayar tetap bisa diuji 14 hari tanpa kartu dan halaman
 * paket menjelaskan bahwa pembayaran belum diaktifkan.
 *
 * Kunci server ikut di sini karena endpoint notifikasi memverifikasi tanda
 * tangan memakai kunci yang sama. Nilainya tidak pernah masuk ke respons API.
 */

export interface SellerIdentity {
  name: string
  address: string
  email: string
  taxId: string | null
  /** Zona waktu penjual untuk tanggal pada faktur. Default WIB. */
  timeZone: string
}

export interface BillingConfig {
  /** Pembayaran dan faktur boleh dipakai. */
  enabled: boolean
  /** Pengembangan tanpa kunci Midtrans: tautan bayar tidak dibuat, notifikasi tetap diverifikasi. */
  simulation: boolean
  sandbox: boolean
  serverKey: string | null
  seller: SellerIdentity
  refundPolicyUrl: string | null
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function readBillingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  // Simulasi tidak pernah menyala di produksi: tanpa kunci sungguhan, tagihan
  // bisa dianggap lunas tanpa uang masuk.
  const simulation = env.PAYMENT_SIMULATION === '1' && env.NODE_ENV !== 'production'
  const serverKey = clean(env.MIDTRANS_SERVER_KEY)
  const seller: SellerIdentity = {
    name: clean(env.BILLING_SELLER_NAME) ?? '',
    address: clean(env.BILLING_SELLER_ADDRESS) ?? '',
    email: clean(env.BILLING_SELLER_EMAIL) ?? '',
    taxId: clean(env.BILLING_SELLER_TAX_ID),
    timeZone: clean(env.BILLING_SELLER_TIMEZONE) ?? 'Asia/Jakarta',
  }
  const refundPolicyUrl = clean(env.BILLING_REFUND_POLICY_URL)
  const sellerReady = seller.name !== '' && seller.address !== '' && seller.email !== ''

  return {
    // Kunci server wajib walau gateway disimulasikan: notifikasi pembayaran
    // hanya dipercaya setelah tanda tangannya diverifikasi dengan kunci itu,
    // jadi tanpa kunci tidak ada jalan sah untuk menandai tagihan lunas.
    enabled: sellerReady && refundPolicyUrl !== null && serverKey !== null,
    simulation,
    sandbox: env.MIDTRANS_PRODUCTION !== 'true',
    serverKey,
    seller,
    refundPolicyUrl,
  }
}

export function createPaymentGateway(config: BillingConfig): PaymentGateway | null {
  if (!config.enabled || !config.serverKey) {
    return null
  }
  if (config.simulation) {
    return createSimulatedGateway()
  }
  return createMidtransGateway({ serverKey: config.serverKey, sandbox: config.sandbox })
}
