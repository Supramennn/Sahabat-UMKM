/**
 * Mengisi satu workspace contoh lewat API, lalu mengambil tangkapan layar beranda
 * (PRD 11) dari aplikasi yang sedang berjalan. Hasilnya disimpan ke
 * apps/web/public/beranda dan ikut di-commit.
 *
 * Cara pakai:
 *   1. npx tsx scripts/dev-api.mts   (dengan log: npx tsx scripts/dev-api.mts 2>&1 | Tee-Object -FilePath .tmp/dev-api.log)
 *   2. npm run build, lalu npm run start --workspace apps/web
 *   3. npx tsx scripts/beranda-gambar.mts
 *
 * Teks alternatif dan ukuran gambarnya dinyatakan di apps/web/src/lib/beranda.ts;
 * skrip ini hanya mengisi data dan memotret, jadi gambarnya selalu tangkapan layar
 * aplikasi yang sesungguhnya (K-07: diberi label data contoh).
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const API = 'http://127.0.0.1:4000'
const WEB = 'http://localhost:3000'
const SANDI = 'kata-sandi-pengujian-2026'
const LOG_API = '.tmp/dev-api.log'
const KELUARAN = 'apps/web/public/beranda'

let cookie = ''

async function panggil<T>(method: string, path: string, isi?: unknown): Promise<T> {
  const respons = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: isi === undefined ? undefined : JSON.stringify(isi),
  })
  const teks = await respons.text()
  if (!respons.ok) {
    throw new Error(`${method} ${path} gagal: ${respons.status} ${teks}`)
  }
  const [setCookie] = respons.headers.getSetCookie()
  if (setCookie) cookie = setCookie.split(';')[0] ?? cookie
  return (teks ? JSON.parse(teks) : null) as T
}

async function tungguApi(): Promise<void> {
  for (let percobaan = 0; percobaan < 120; percobaan += 1) {
    try {
      await fetch(`${API}/api/workspaces`)
      return
    } catch {
      await new Promise((lanjut) => setTimeout(lanjut, 500))
    }
  }
  throw new Error('API tidak siap setelah satu menit.')
}

/** Tee-Object PowerShell menulis berkas UTF-16, sedangkan Node membaca UTF-8. */
function bacaLog(): string {
  const buffer = readFileSync(LOG_API)
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }
  return buffer.toString('utf8')
}

function bacaToken(): string | null {
  const cocok = [...bacaLog().matchAll(/[?&]token=([A-Za-z0-9_-]+)/g)].at(-1)
  return cocok?.[1] ?? null
}

/** Email verifikasi dikirim oleh penjadwal notifikasi, jadi lognya tidak langsung ada. */
async function tokenVerifikasi(): Promise<string> {
  for (let percobaan = 0; percobaan < 60; percobaan += 1) {
    const token = bacaToken()
    if (token) return token
    await new Promise((lanjut) => setTimeout(lanjut, 500))
  }
  throw new Error(`Tautan verifikasi tidak ditemukan di ${LOG_API}.`)
}

interface ProdukContoh {
  sku: string
  nama: string
  kategori: string
  satuan: string
  hargaBeli?: number
  hargaJual?: number
  minimum: number
  /** Saldo awal lewat pergerakan stok. */
  saldo: number
  /** Harga pokok satuan untuk saldo awal. */
  pokok: number
}

const kategori = ['Bahan baku', 'Kemasan', 'Menu']

const produk: ProdukContoh[] = [
  { sku: 'BJI-ARB', nama: 'Biji Arabika Gayo 1 kg', kategori: 'Bahan baku', satuan: 'kg', hargaBeli: 150000, minimum: 4, saldo: 5, pokok: 150000 },
  { sku: 'BJI-ROB', nama: 'Biji Robusta Lampung 1 kg', kategori: 'Bahan baku', satuan: 'kg', hargaBeli: 95000, minimum: 4, saldo: 3, pokok: 95000 },
  { sku: 'GUL-ARN', nama: 'Gula Aren Cair 1 L', kategori: 'Bahan baku', satuan: 'liter', hargaBeli: 28000, minimum: 6, saldo: 4, pokok: 28000 },
  { sku: 'CUP-16', nama: 'Cup Plastik 16 oz', kategori: 'Kemasan', satuan: 'pack', hargaBeli: 32000, minimum: 10, saldo: 6, pokok: 32000 },
  { sku: 'TUT-16', nama: 'Tutup Cup 16 oz', kategori: 'Kemasan', satuan: 'pack', hargaBeli: 18000, minimum: 10, saldo: 6, pokok: 18000 },
  { sku: 'SED-KRT', nama: 'Sedotan Kertas', kategori: 'Kemasan', satuan: 'pack', hargaBeli: 12000, minimum: 8, saldo: 4, pokok: 12000 },
  { sku: 'MNU-KPS', nama: 'Kopi Susu Gula Aren', kategori: 'Menu', satuan: 'pcs', hargaJual: 25000, minimum: 10, saldo: 28, pokok: 11000 },
  { sku: 'MNU-AME', nama: 'Kopi Americano', kategori: 'Menu', satuan: 'pcs', hargaJual: 22000, minimum: 10, saldo: 24, pokok: 8000 },
  { sku: 'MNU-MTC', nama: 'Matcha Latte', kategori: 'Menu', satuan: 'pcs', hargaJual: 26000, minimum: 6, saldo: 18, pokok: 12000 },
  { sku: 'MNU-TEH', nama: 'Teh Manis', kategori: 'Menu', satuan: 'pcs', hargaJual: 10000, minimum: 10, saldo: 30, pokok: 3500 },
  { sku: 'MNU-RTB', nama: 'Roti Bakar Cokelat', kategori: 'Menu', satuan: 'pcs', hargaJual: 18000, minimum: 6, saldo: 16, pokok: 7000 },
  { sku: 'MNU-AIR', nama: 'Air Mineral 600 ml', kategori: 'Menu', satuan: 'pcs', hargaJual: 5000, minimum: 12, saldo: 20, pokok: 2500 },
]

async function isiContoh(): Promise<void> {
  const email = 'pemilik@kedaicontoh.test'

  // Akun dari percobaan sebelumnya tidak menggagalkan skrip: token di log
  // mungkin sudah terpakai, jadi hasil verifikasinya diabaikan dan login yang
  // menentukan apakah akunnya siap.
  const pendaftaran = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SANDI, name: 'Sari' }),
  })
  const token = pendaftaran.ok ? await tokenVerifikasi() : bacaToken()
  if (token) {
    await fetch(`${API}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  }
  await panggil('POST', '/api/auth/login', { email, password: SANDI })

  const { workspaceId } = await panggil<{ workspaceId: number }>('POST', '/api/workspaces', {
    name: 'Kedai Kopi Contoh',
    businessType: 'Kedai kopi',
    timezone: 'Asia/Jakarta',
  })

  // Penjualan dan retur hanya ada di paket berbayar, jadi workspace contoh
  // memakai uji coba paket Usaha seperti pemilik usaha yang mencoba aplikasinya.
  await panggil('POST', `/api/workspaces/${workspaceId}/subscription/plan`, { plan: 'usaha' })

  const { locationId } = await panggil<{ locationId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/locations`,
    { name: 'Kedai Utama', code: 'KDC' },
  )

  const kategoriId: Record<string, number> = {}
  for (const nama of kategori) {
    const hasil = await panggil<{ categoryId: number }>(
      'POST',
      `/api/workspaces/${workspaceId}/categories`,
      { name: nama },
    )
    kategoriId[nama] = hasil.categoryId
  }

  const produkId: Record<string, number> = {}
  for (const item of produk) {
    const hasil = await panggil<{ productId: number }>(
      'POST',
      `/api/workspaces/${workspaceId}/products`,
      {
        sku: item.sku,
        name: item.nama,
        categoryId: kategoriId[item.kategori],
        unitCode: item.satuan,
        referencePurchasePrice: item.hargaBeli ?? null,
        sellingPrice: item.hargaJual ?? null,
        minStock: item.minimum,
      },
    )
    produkId[item.sku] = hasil.productId
  }

  for (const item of produk) {
    await panggil('POST', `/api/workspaces/${workspaceId}/stock/movements`, {
      productId: produkId[item.sku],
      locationId,
      kind: 'masuk',
      quantity: item.saldo,
      unitCost: item.pokok,
      reasonCode: 'saldo_awal',
      note: 'Saldo awal data contoh',
    })
  }

  const { supplierId } = await panggil<{ supplierId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/suppliers`,
    {
      name: 'Supplier Kopi Nusantara',
      contactName: 'Pak Bimo',
      phone: '0812-0000-0000',
      paymentTermDays: 14,
    },
  )

  const { supplierId: supplierIdKemasan } = await panggil<{ supplierId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/suppliers`,
    {
      name: 'Grosir Kemasan Prima',
      contactName: 'Bu Rina',
      phone: '0813-0000-0000',
      paymentTermDays: 7,
    },
  )

  const pesanan = [
    { sku: 'BJI-ARB', quantity: 6, unitPrice: 150000 },
    { sku: 'SUS-UHT', quantity: 24, unitPrice: 21000 },
    { sku: 'GUL-ARN', quantity: 8, unitPrice: 28000 },
    { sku: 'CUP-16', quantity: 10, unitPrice: 32000 },
    { sku: 'SED-KRT', quantity: 6, unitPrice: 12000 },
  ]

  // Susu belum punya produk: dibuat di sini supaya penerimaan bisa menambah stoknya.
  const susu = await panggil<{ productId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/products`,
    {
      sku: 'SUS-UHT',
      name: 'Susu UHT Full Cream 1 L',
      categoryId: kategoriId['Bahan baku'],
      unitCode: 'liter',
      referencePurchasePrice: 21000,
      minStock: 30,
    },
  )
  produkId['SUS-UHT'] = susu.productId

  const { orderId } = await panggil<{ orderId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/purchase-orders`,
    {
      supplierId,
      locationId,
      expectedOn: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      note: 'Pesanan mingguan data contoh',
      items: pesanan.map((item) => ({
        productId: produkId[item.sku],
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
  )

  await panggil('POST', `/api/workspaces/${workspaceId}/purchase-orders/${orderId}/submit`, {})
  await panggil('POST', `/api/workspaces/${workspaceId}/purchase-orders/${orderId}/approve`, {})

  await panggil('POST', `/api/workspaces/${workspaceId}/goods-receipts`, {
    purchaseOrderId: orderId,
    locationId,
    note: 'Barang datang lengkap',
    items: pesanan.map((item) => ({
      productId: produkId[item.sku],
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    idempotencyKey: 'penerimaan-contoh-1',
  })

  // PO kedua sengaja dibiarkan menunggu persetujuan, supaya halaman PO dan
  // kartu "PO belum selesai" di dashboard menampilkan keadaan yang bergerak.
  const { orderId: orderIdKedua } = await panggil<{ orderId: number }>(
    'POST',
    `/api/workspaces/${workspaceId}/purchase-orders`,
    {
      supplierId: supplierIdKemasan,
      locationId,
      expectedOn: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
      note: 'Pesanan rutin data contoh',
      items: [
        { productId: produkId['CUP-16']!, quantity: 20, unitPrice: 32000 },
        { productId: produkId['TUT-16']!, quantity: 24, unitPrice: 18000 },
        { productId: produkId['SED-KRT']!, quantity: 12, unitPrice: 12000 },
      ],
    },
  )
  await panggil('POST', `/api/workspaces/${workspaceId}/purchase-orders/${orderIdKedua}/submit`, {})

  const penjualan: Array<{ metode: string; barang: Array<{ sku: string; quantity: number }> }> = [
    { metode: 'Tunai', barang: [{ sku: 'MNU-KPS', quantity: 2 }, { sku: 'MNU-AIR', quantity: 1 }] },
    { metode: 'QRIS', barang: [{ sku: 'MNU-AME', quantity: 1 }, { sku: 'MNU-RTB', quantity: 1 }] },
    { metode: 'QRIS', barang: [{ sku: 'MNU-KPS', quantity: 3 }] },
    { metode: 'Tunai', barang: [{ sku: 'MNU-MTC', quantity: 1 }, { sku: 'MNU-TEH', quantity: 2 }] },
    { metode: 'QRIS', barang: [{ sku: 'MNU-RTB', quantity: 2 }, { sku: 'MNU-KPS', quantity: 1 }] },
    { metode: 'Transfer bank', barang: [{ sku: 'MNU-AME', quantity: 2 }, { sku: 'MNU-AIR', quantity: 3 }] },
  ]

  let urutan = 1
  for (const transaksi of penjualan) {
    await panggil('POST', `/api/workspaces/${workspaceId}/sales`, {
      locationId,
      paymentMethodLabel: transaksi.metode,
      idempotencyKey: `penjualan-contoh-${urutan}`,
      items: transaksi.barang.map((item) => ({
        productId: produkId[item.sku],
        quantity: item.quantity,
        unitPrice: produk.find((kandidat) => kandidat.sku === item.sku)?.hargaJual ?? 0,
      })),
    })
    urutan += 1
  }

  const pengeluaran = [
    { kategori: 'Operasional harian', description: 'Es batu dan air galon', amount: 45000 },
    { kategori: 'Listrik dan air', description: 'Token listrik kedai', amount: 203000 },
  ]

  for (const item of pengeluaran) {
    await panggil('POST', `/api/workspaces/${workspaceId}/expenses`, {
      categoryName: item.kategori,
      description: item.description,
      amount: item.amount,
    })
  }
}

async function ambilGambar(): Promise<void> {
  const [nama, nilai] = cookie.split('=')
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    locale: 'id-ID',
  })
  await context.addCookies([{ name: nama ?? 'sahabat_session', value: nilai ?? '', domain: 'localhost', path: '/' }])

  const halaman = [
    { path: '/dashboard', berkas: 'dashboard.png' },
    { path: '/stok', berkas: 'stok.png' },
    { path: '/pembelian/po', berkas: 'pembelian.png' },
    { path: '/penjualan', berkas: 'penjualan.png' },
    // Tiga gambar tambahan untuk halaman fitur Pengeluaran, Laporan, dan
    // Langganan (Fase 12). Semua memakai workspace contoh yang sama.
    { path: '/pengeluaran', berkas: 'pengeluaran.png' },
    { path: '/laporan', berkas: 'laporan.png' },
    { path: '/pengaturan/paket', berkas: 'langganan.png' },
  ]

  for (const item of halaman) {
    const page = await context.newPage()
    await page.goto(`${WEB}${item.path}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('h1', { state: 'visible' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${KELUARAN}/${item.berkas}` })
    console.log(`tangkapan layar: ${item.berkas}`)
    await page.close()
  }

  await browser.close()
}

await tungguApi()
mkdirSync(KELUARAN, { recursive: true })
await isiContoh()
await ambilGambar()
console.log('Data contoh dan tangkapan layar selesai.')
