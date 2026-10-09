/**
 * Rasio kontras WCAG 2.x. PRD 10 mewajibkan setiap pasangan warna baru dihitung
 * sebelum dipakai, jadi rumus ini berada di kode dan bukan di dokumen.
 *
 * rumus: (L1 + 0.05) / (L2 + 0.05), dengan L luminans relatif.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const cleaned = hex.trim().replace('#', '')
  if (cleaned.length === 3) {
    throw new Error(`Gunakan warna enam digit, bukan tiga digit: ${hex}`)
  }
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Warna tidak valid: ${hex}`)
  }
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  }
}

function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(hexToRgb(foreground))
  const l2 = relativeLuminance(hexToRgb(background))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace('.', ',')}:1`
}
