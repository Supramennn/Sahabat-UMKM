import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colors, minTouchTarget, radii, typography } from '../src/tokens.ts'

/**
 * Tailwind membaca token lewat blok @theme di apps/web/src/styles/globals.css.
 * Tes ini menjaga salinan itu tetap sama dengan tokens.ts, supaya tidak ada dua
 * versi kebenaran yang bisa menyimpang diam-diam. Kalau token berubah, globals.css
 * harus ikut berubah, dan sebaliknya tidak boleh ada warna liar di sana.
 */

const cssPath = fileURLToPath(new URL('../../../apps/web/src/styles/globals.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

function themeBlock(): string {
  const match = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)
  if (!match?.[1]) {
    throw new Error(`Blok @theme tidak ditemukan di ${cssPath}`)
  }
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '')
}

const declarations = new Map<string, string>()
for (const match of themeBlock().matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  declarations.set(match[1] ?? '', (match[2] ?? '').trim())
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

describe('salinan token di globals.css', () => {
  it('memuat semua warna dari tokens.ts dengan nilai yang sama', () => {
    const beda: string[] = []
    for (const [key, value] of Object.entries(colors)) {
      const cssValue = declarations.get(`color-${kebab(key)}`)
      if (!cssValue || cssValue.toLowerCase() !== value.toLowerCase()) {
        beda.push(`${key}: ${value} vs ${cssValue ?? 'tidak ada'}`)
      }
    }
    expect(beda).toEqual([])
  })

  it('tidak menambah warna yang tidak ada di tokens.ts', () => {
    const diharapkan = new Set(Object.keys(colors).map((key) => `color-${kebab(key)}`))
    const tambahan = [...declarations.keys()].filter(
      (name) => name.startsWith('color-') && !diharapkan.has(name),
    )
    expect(tambahan).toEqual([])
  })

  it('memuat radius, target sentuh, dan font yang sama', () => {
    expect(declarations.get('radius-control')).toBe(radii.control)
    expect(declarations.get('radius-surface')).toBe(radii.surface)
    expect(declarations.get('radius-badge')).toBe(radii.badge)
    expect(declarations.get('spacing-touch')).toBe(minTouchTarget)
    expect(declarations.get('font-sans')).toBe(typography.fontFamily)
  })
})
