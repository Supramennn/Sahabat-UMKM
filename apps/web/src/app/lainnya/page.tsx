'use client'

import { useApp, AppProvider } from '../components/app-context'
import { AppShell, moduleNav } from '../components/shell'
import { PANDUAN_MODUL } from '../../lib/panduan-modul'

/**
 * Halaman Lainnya untuk navigasi bawah ponsel (PRD 10). Isinya diambil dari
 * daftar menu yang sama dengan sidebar, jadi tidak ada tautan yang hanya hidup
 * di satu tempat. Empat tujuan yang sudah ada di navigasi bawah tidak diulang.
 *
 * Panduan singkat per modul (PRD 12) dibaca lagi dari sini: panel di halaman
 * modul bisa ditutup, dan teks yang sama tetap ada di bagian ini.
 */

const DI_NAVIGASI_BAWAH = new Set(['/dashboard', '/stok', '/pembelian', '/penjualan', '/lainnya'])
const GRUP: Array<{ judul: string; awalan: string }> = [
  { judul: 'Stok', awalan: '/stok/' },
  { judul: 'Pembelian', awalan: '/pembelian/' },
  { judul: 'Penjualan', awalan: '/penjualan/' },
  { judul: 'Laporan, biaya, dan pengaturan', awalan: '' },
]

function grupUntuk(href: string): string {
  for (const grup of GRUP.slice(0, -1)) {
    if (href.startsWith(grup.awalan)) return grup.judul
  }
  return GRUP[GRUP.length - 1]!.judul
}

export default function MorePage() {
  return (
    <AppProvider title="Menu lainnya">
      <MorePageContent />
    </AppProvider>
  )
}

function MorePageContent() {
  const app = useApp()
  const items = moduleNav.filter((item) => !DI_NAVIGASI_BAWAH.has(item.href))
  const grup = GRUP
    .map((group) => ({ ...group, items: items.filter((item) => grupUntuk(item.href) === group.judul) }))
    .filter((group) => group.items.length > 0)

  return (
    <AppShell workspaceName={app.workspaceName} roleLabel={app.roleLabel} activeHref="/lainnya" breadcrumb="Beranda" title="Menu lainnya">
      <section className="flex min-w-0 flex-col gap-6">
        <p className="text-[0.9375rem] text-text-secondary">Semua halaman yang tidak ada di navigasi bawah, dikelompokkan supaya mudah dicari.</p>
        {grup.map((group) => (
          <section key={group.judul} className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
            <h2 className="text-lg font-semibold">{group.judul}</h2>
            <ul className="flex flex-col">
              {group.items.map((item) => <li key={item.href} className="border-t border-border-subtle first:border-t-0">
                <a className="flex min-h-touch items-center font-semibold text-secondary" href={item.href}>{item.label}</a>
              </li>)}
            </ul>
          </section>
        ))}

        <section aria-labelledby="judul-panduan-modul" className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <h2 className="text-lg font-semibold" id="judul-panduan-modul">Panduan singkat per modul</h2>
          {PANDUAN_MODUL.map((panduan) => (
            <article key={panduan.slug} className="border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <h3 className="text-[0.9375rem] font-semibold">{panduan.judul}</h3>
              {panduan.paragraf.map((paragraf) => (
                <p key={paragraf.slice(0, 24)} className="text-[0.9375rem] text-text-secondary">{paragraf}</p>
              ))}
              <ul className="flex flex-wrap gap-2">
                {panduan.tautan.map((tautan) => (
                  <li key={tautan.href + tautan.label}>
                    <a className="inline-flex min-h-touch items-center font-semibold text-secondary" href={tautan.href}>
                      {tautan.label}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </section>
    </AppShell>
  )
}
