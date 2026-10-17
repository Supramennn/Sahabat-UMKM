'use client'

import { MotionConfig, motion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Gerak dipakai terukur, bukan hiasan: konten masuk dengan naik halus, dan
 * pengguna yang meminta gerak dikurangi lewat pengaturan sistem otomatis tidak
 * mendapat animasi transform (MotionConfig reducedMotion="user").
 */

/** Kurva masuk yang tenang, dipakai bersama semua animasi masuk. */
export const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/**
 * Pembungkus isi halaman. Hanya transformasi, tanpa opasitas, supaya tidak ada
 * teks yang sempat buram dan pengukuran kontras tetap stabil, termasuk saat
 * pemeriksaan aksesibilitas otomatis berjalan.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.24, ease: ENTER_EASE }}
    >
      {children}
    </motion.div>
  )
}
