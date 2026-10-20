'use client'

import { useEffect } from 'react'

/**
 * Pendaftaran service worker (PRD 10: aplikasi dapat dipasang dan halaman yang
 * sudah dimuat tetap bisa dibuka saat offline).
 *
 * Pendaftaran hanya pada build produksi supaya pengembangan dengan penuh hal
 * isi baru tidak tersangkut salinan lama. Peramban yang tidak mendukung
 * service worker cukup memakai halaman biasa; tidak ada yang gagal karena ini.
 */
export function PwaRegistrasi() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Kegagalan pendaftaran (misalnya konteks tidak aman) tidak boleh mematahkan
      // halaman: aplikasi tetap berjalan online tanpa kemampuan offline.
    })
  }, [])

  return null
}
