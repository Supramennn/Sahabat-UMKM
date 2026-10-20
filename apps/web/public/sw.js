/**
 * Service worker Sahabat UMKM (PRD 10: halaman yang sudah dimuat tetap bisa
 * dibuka saat sinyal hilang).
 *
 * Aturannya sengaja sempit supaya tidak pernah menyaji angka yang basi:
 * - Halaman (navigasi) dibawa jaringan dulu; salinan dipakai hanya saat jaringan
 *   gagal. Halaman yang belum pernah dibuka jatuh ke offline.html.
 * - Aset statis yang tak berubah (/_next/static/, ikon, gambar contoh) memakai
 *   salinan dulu karena menurut namanya berubah.
 * - API berada pada asal (origin) yang berbeda dan tidak pernah disentuh: data
 *   stok adalah data padu server, bukan salinan peramban. Input offline diurus
 *   antrean di apps/web/src/lib/offline.ts, bukan oleh service worker.
 */

const NAMA_SHELL = 'sahabat-shell-v1'
const NAMA_ASET = 'sahabat-aset-v1'
const MAKS_SHELL = 30

self.addEventListener('install', (kejadian) => {
  kejadian.waitUntil(
    (async () => {
      const shell = await caches.open(NAMA_SHELL)
      await shell.add(new Request('/offline.html', { cache: 'reload' }))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (kejadian) => {
  kejadian.waitUntil(
    (async () => {
      const kunci = await caches.keys()
      await Promise.all(
        kunci.filter((nama) => nama !== NAMA_SHELL && nama !== NAMA_ASET).map((nama) => caches.delete(nama)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (kejadian) => {
  const permintaan = kejadian.request
  if (permintaan.method !== 'GET') return

  const url = new URL(permintaan.url)
  if (url.origin !== self.location.origin) return

  // Berkas updater harus selalu segar supaya pembaruan service worker terdeteksi.
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return

  if (permintaan.mode === 'navigate') {
    kejadian.respondWith(
      (async () => {
        try {
          const jawaban = await fetch(permintaan)
          if (jawaban.ok) {
            const shell = await caches.open(NAMA_SHELL)
            await shell.put(permintaan, jawaban.clone())
            await potongShell(shell)
          }
          return jawaban
        } catch {
          const shell = await caches.open(NAMA_SHELL)
          const salinan = await shell.match(permintaan)
          if (salinan) return salinan
          const offline = await shell.match('/offline.html')
          if (offline) return offline
          return new Response('Sedang offline dan halaman belum punya salinan.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  const statis = dAsetStatis(url)
  if (statis) {
    kejadian.respondWith(
      (async () => {
        const aset = await caches.open(NAMA_ASET)
        const salinan = await aset.match(permintaan)
        if (salinan) return salinan
        const jawaban = await fetch(permintaan)
        if (jawaban.ok) {
          await aset.put(permintaan, jawaban.clone())
        }
        return jawaban
      })(),
    )
    return
  }

  // Aset lain satu asal: selalu jaringan dulu. Salinan lama diekor hanya bila
  // jaringan gagal, dan pengguna melihat halaman bilang data tidak bisa dimuat
  // karena kegagalan bukan yang ditutupi menggunting data lama seolah baru.
  kejadian.respondWith(
    (async () => {
      try {
        return await fetch(permintaan)
      } catch {
        const cocok = await caches.match(permintaan)
        if (cocok) return cocok
        throw new Error('Aset tidak tersedia saat offline.')
      }
    })(),
  )
})

function dAsetStatis(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/ikon/') || url.pathname.startsWith('/beranda/')
}

async function potongShell(shell) {
  const kunci = await shell.keys()
  if (kunci.length <= MAKS_SHELL) return
  for (const namaLewat of kunci.slice(0, kunci.length - MAKS_SHELL)) {
    await shell.delete(namaLewat)
  }
}
