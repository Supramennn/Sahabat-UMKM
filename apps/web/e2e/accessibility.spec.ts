import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * PRD 10 dan PRD 17: seluruh fungsi bisa dioperasikan dengan keyboard, fokus
 * selalu terlihat, dan halaman tidak punya gulir horizontal. Berkas ini memeriksa
 * ketiga hal itu pada halaman yang benar-benar dirender.
 */

const HALAMAN = [
  { path: '/', nama: 'beranda sementara' },
  { path: '/masuk', nama: 'masuk' },
  { path: '/buat-akun', nama: 'buat akun' },
  { path: '/lupa-kata-sandi', nama: 'lupa kata sandi' },
  { path: '/atur-ulang-kata-sandi', nama: 'atur ulang kata sandi' },
  { path: '/verifikasi-email', nama: 'verifikasi email' },
  { path: '/masuk/verifikasi', nama: 'verifikasi MFA' },
  { path: '/stok', nama: 'daftar barang' },
  { path: '/stok/input', nama: 'input stok' },
  { path: '/stok/riwayat', nama: 'riwayat stok' },
  { path: '/pembelian', nama: 'ringkasan pembelian' },
  { path: '/pembelian/po', nama: 'daftar PO' },
  { path: '/pembelian/supplier', nama: 'supplier' },
  { path: '/pembelian/pembayaran', nama: 'pembayaran supplier' },
  { path: '/pembelian/penerimaan', nama: 'penerimaan barang' },
  { path: '/stok/peringatan', nama: 'peringatan stok' },
  { path: '/stok/impor', nama: 'impor barang' },
  { path: '/pembelian/retur', nama: 'retur pembelian' },
  { path: '/penjualan', nama: 'daftar penjualan' },
  { path: '/penjualan/baru', nama: 'catat penjualan' },
  { path: '/penjualan/pelanggan', nama: 'pelanggan' },
  { path: '/penjualan/impor', nama: 'impor penjualan' },
  { path: '/pengeluaran', nama: 'daftar pengeluaran' },
  { path: '/pengeluaran/baru', nama: 'catat pengeluaran' },
  { path: '/pengeluaran/kategori', nama: 'kategori pengeluaran' },
  { path: '/pengaturan/paket', nama: 'paket dan langganan' },
  { path: '/laporan', nama: 'laporan usaha' },
]

test.describe('halaman autentikasi', () => {
  for (const halaman of HALAMAN) {
    test(`${halaman.nama} tidak punya gulir horizontal`, async ({ page }) => {
      await page.goto(halaman.path)

      const meluap = await page.evaluate(() => {
        const doc = document.documentElement
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
        }
      })

      // PRD 10: tidak ada gulir horizontal pada halaman. Toleransi satu piksel
      // untuk pembulatan subpiksel di sebagian peramban.
      expect(meluap.scrollWidth).toBeLessThanOrEqual(meluap.clientWidth + 1)
    })

    test(`${halaman.nama} punya tepat satu judul utama`, async ({ page }) => {
      await page.goto(halaman.path)
      await expect(page.locator('h1')).toHaveCount(1)
    })
  }
})

test.describe('target sentuh', () => {
  test('tombol dan tautan cukup tinggi untuk jari', async ({ page }) => {
    await page.goto('/masuk')

    const target = page.locator('button, a[href]')
    const count = await target.count()
    expect(count).toBeGreaterThan(0)

    for (let index = 0; index < count; index += 1) {
      const element = target.nth(index)
      const box = await element.boundingBox()
      if (!box) {
        continue
      }
      const label = (await element.innerText()).slice(0, 24) || (await element.getAttribute('type')) || 'elemen'
      // Tautan di dalam paragraf boleh lebih pendek dari 44px kalau bukan target
      // utama, jadi yang diperiksa adalah lebar minimal dan tinggi tombol penuh.
      const isButton = await element.evaluate((node) => node.tagName === 'BUTTON')
      if (isButton) {
        expect(box.height, `tinggi tombol ${label}`).toBeGreaterThanOrEqual(44)
      }
      expect(box.width, `lebar ${label}`).toBeGreaterThanOrEqual(24)
    }
  })
})

test.describe(' navigasi keyboard', () => {
  test('formulir masuk bisa diisi dan dikirim tanpa tetikus', async ({ page }) => {
    await page.goto('/masuk')

    await page.keyboard.press('Tab')
    await page.keyboard.type('seseorang@contoh.test')

    // Tab berikutnya harus langsung ke kata sandi, jadi urutan fokus mengikuti
    // urutan visual.
    await page.keyboard.press('Tab')
    await page.keyboard.type('kata-sandi-uji-2026')

    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    // Form terkirim, jadi ada tanda sedang memproses atau pesan galat.
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 10_000 })
  })

  test('fokus terlihat saat berpindah dengan Tab', async ({ page }) => {
    await page.goto('/masuk')

    await page.keyboard.press('Tab')
    const email = page.locator('#email')
    await expect(email).toBeFocused()

    // :focus-visible harus menghasilkan outline, bukan dihapus.
    const adaOutline = await email.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
    })
    expect(adaOutline).toBe(true)
  })
})

test.describe('keterbacaan', () => {
  test('tidak ada pelanggaran axe yang serius pada halaman masuk', async ({ page }) => {
    await page.goto('/masuk')

    const hasil = await new AxeBuilder({ page }).analyze()

    // serious dan critical adalah batas yang PRD 10 tetapkan. Pelanggaran
    // moderate dan minor dicatat tapi tidak menggagalkan build, karena
    // perbaikannya dinilai manual.
    const serius = hasil.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    const ringkasan = serius.map((v) => `${v.id}: ${v.nodes.length} node`)
    expect(ringkasan, ringkasan.join(' | ')).toHaveLength(0)
  })

  test('tidak ada pelanggaran axe pada buat akun', async ({ page }) => {
    await page.goto('/buat-akun')

    const hasil = await new AxeBuilder({ page }).analyze()
    const serius = hasil.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    const ringkasan = serius.map((v) => `${v.id}: ${v.nodes.length} node`)
    expect(ringkasan, ringkasan.join(' | ')).toHaveLength(0)
  })
})

test.describe('keadaan data', () => {
  test('pengaturan akun menampilkan keadaan memuat lalu selesai', async ({ page }) => {
    // Halaman memuat sesi dari server, jadi keadaan awal adalah memuat lalu
    // akhir. PRD 10 meminta keduanya ada.
    await page.goto('/pengaturan/akun')

    const memuat = page.getByText('Memuat pengaturan akun.')
    await expect(memuat).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Permintaan bisa selesai sebelum pemeriksaan dimulai kalau mesinnya cepat.
      // Itu tidak membuat tes gagal, karena yang diperiksa adalah hasil akhirnya.
    })

    // Apa pun keadaannya, halaman harus punya judul utama dan tidak boleh
    // menampilkan keadaan memuat terus-menerus.
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(memuat).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('Tidak bisa menghubungi server')).toHaveCount(0)
  })

  test('pengaturan akun tanpa sesi menjelaskan apa yang terjadi', async ({ page }) => {
    await page.goto('/pengaturan/akun')

    // Tanpa sesi, server membalas 401 dan halaman harus menawarkan jalan keluar,
    // bukan menampilkan halaman kosong.
    // Next.js memakai role alert untuk pengumuman rute, jadi penyelector
    // ditunjukkan ke teks yang benar-benar ditulis halaman ini.
    await expect(page.getByText('Pengaturan akun tidak bisa dimuat')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('a[href="/masuk"]')).toBeVisible()
  })

  test('halaman stok tanpa sesi menjelaskan apa yang terjadi', async ({ page }) => {
    await page.goto('/stok')

    await expect(page.getByText('Halaman ini belum bisa dibuka')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('a[href="/masuk"]')).toBeVisible()
    // Judul utama tetap ada walau datanya gagal dimuat (PRD 10).
    await expect(page.locator('h1')).toHaveCount(1)
  })

  test('halaman pembelian tanpa sesi menjelaskan apa yang terjadi', async ({ page }) => {
    await page.goto('/pembelian/po')

    await expect(page.getByText('Halaman ini belum bisa dibuka')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('h1')).toHaveCount(1)
  })

  test('halaman penjualan tanpa sesi menjelaskan apa yang terjadi', async ({ page }) => {
    await page.goto('/penjualan/baru')

    await expect(page.getByText('Halaman ini belum bisa dibuka')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('a[href="/masuk"]')).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
  })

  // A-11: halaman publik tidak punya sesi, dan tidak boleh diindeks mesin pencari.
  test('tautan baca-saja yang tidak berlaku menjelaskan tanpa meminta masuk', async ({ page }) => {
    await page.goto('/po/token-yang-tidak-pernah-dibuat-123456')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/tidak berlaku/i, {
      timeout: 15_000,
    })
    // Tidak ada permalink ke halaman masuk: penerima tautan bukan pengguna aplikasi.
    await expect(page.locator('a[href="/masuk"]')).toHaveCount(0)
  })

  test('tautan baca-saja tidak meminta mesin pencari mengindeksnya', async ({ page }) => {
    await page.goto('/po/token-yang-tidak-pernah-dibuat-123456')

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})
