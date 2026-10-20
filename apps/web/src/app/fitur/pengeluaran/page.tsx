import { HalamanModulFitur, metadataModul } from '../halaman-modul'
import { modulBySlug } from '../../../lib/fitur'

/** Halaman fitur modul Pengeluaran (PRD 11). */

const modul = modulBySlug('pengeluaran')!

export const metadata = metadataModul(modul)

export default function Page() {
  return <HalamanModulFitur modul={modul} />
}
