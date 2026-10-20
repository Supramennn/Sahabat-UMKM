import { expect, test } from '@playwright/test'

/**
 * PRD 10: aplikasi dapat dipasang sebagai PWA dan halaman yang sudah dimuat
 * tetap bisa dibuka saat sinyal hilang. Diperiksa lewat server produksi: tautan
 * manifest, pendaftaran service worker, dan buka ulang halaman tanpa jaringan.
 */

test('manifest dan ikon PWA tersedia serta service worker terdaftar', async ({ page }) => {
  test.setTimeout(60_000)

  await page.goto('/')

  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('/manifest.webmanifest')
  expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0)
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#172B4D')

  const berkasServis = await page.request.get('/sw.js')
  expect(berkasServis.status()).toBe(200)
  expect((await berkasServis.text()).includes('offline.html')).toBe(true)
  expect((await page.request.get('/offline.html')).status()).toBe(200)

  // Pendaftaran service worker hanya di build produksi, dan berjalan dalam
  // keadaan aktif supaya laman dapat dilayani tanpa jaringan. scriptURL kembali
  // absolut, jadi yang dibandingkan adalah path-nya.
  await expect
    .poll(
      async () => {
        const skrip = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.scriptURL ?? null)
        return skrip === null ? null : new URL(skrip).pathname
      },
      { timeout: 15_000 },
    )
    .toBe('/sw.js')
})

test('halaman yang pernah dibuka tetap terbuka tanpa sinyal (PRD 10)', async ({ page }) => {
  test.setTimeout(90_000)

  await page.goto('/') // PWA terpasang setelah halaman pertama.
  await expect
    .poll(async () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/'))), {
      timeout: 15_000,
    })
    .toBe(true)

  // Halaman publik berikut tersalin oleh service worker saat jaringan sehat.
  await page.goto('/bantuan')
  await expect(page.locator('h1')).toHaveCount(1)

  await page.context().setOffline(true)
  await page.reload()

  // Dari salinan shell: struktur halaman ada. Halaman tidak menyamar sebagai
  // data server segar, jadi bagian yang butuh sinyal menampilkan galat.
  await expect(page.locator('h1')).toHaveCount(1)

  await page.context().setOffline(false)
})
