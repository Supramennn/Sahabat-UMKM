import { expect, test } from '@playwright/test'

/**
 * PRD 10: isian stok yang dibuat saat sinyal hilang masuk antrean dengan status
 * yang terlihat, dan tidak pernah dianggap berhasil sebelum server mengonfirmasi.
 * Server dibuat tak terjangkau dengan mencegat kiriman ke API, cara yang sama
 * dengan galat jaringan yang dilihat halaman saat peramban offline.
 *
 * Akun contoh dibuat oleh scripts/dev-api.mts, sama dengan yang dipakai foto
 * beranda (README bagian "Situs publik").
 */

test('isian stok saat online gagal masuk antrean, lalu terkirim saat koneksi kembali', async ({ page }) => {
  test.setTimeout(90_000)

  // Sesi terbit lewat formulir masuk, dengan workspace contoh yang berisi data.
  await page.goto('/masuk')
  await page.fill('#email', 'pemilik@kedaicontoh.test')
  await page.fill('#password', 'kata-sandi-pengujian-2026')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 })

  await page.goto('/stok/input')
  const pilihan = page.locator('#produk option:not([value=""])')
  await expect(pilihan.first()).toBeAttached({ timeout: 60_000 })
  const nilaiBarang = await pilihan.first().getAttribute('value')
  expect(nilaiBarang).toBeTruthy()

  // Mencegah kiriman stok sampai server: halaman percaya sinyal hilang.
  await page.route('**/stock/movements', (rute) => void rute.abort())

  await page.selectOption('#produk', nilaiBarang ?? '')
  await page.fill('#jumlah', '5')
  await page.click('button[type="submit"]')

  // Keadaan antrean terlihat dan jelas: belum tersimpan, bukan berhasil.
  await expect(page.getByText('Sinyal tidak tersedia')).toBeVisible({ timeout: 15_000 })
  const kartuAntrean = page.locator('section[aria-labelledby="judul-antrean"]')
  await expect(kartuAntrean.getByText('Menunggu koneksi')).toBeVisible()
  await expect(page.getByText('Tersimpan. Saldo sekarang')).toHaveCount(0)

  // Koneksi kembali, antrean dikirim ulang, server yang konfirmasi.
  await page.unroute('**/stock/movements')
  await kartuAntrean.getByRole('button', { name: 'Kirim ulang semua antrean' }).click()

  await expect(page.getByText(/Terkirim 1 catatan dari antrean/)).toBeVisible({ timeout: 30_000 })
  await expect(kartuAntrean).toHaveCount(0)
})
