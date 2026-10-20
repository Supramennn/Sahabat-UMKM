import { HalamanModulFitur, metadataModul } from '../halaman-modul'
import { modulBySlug } from '../../../lib/fitur'

/** Halaman fitur modul Stok (PRD 11). */

const modul = modulBySlug('stok')!

export const metadata = metadataModul(modul)

export default function Page() {
  return <HalamanModulFitur modul={modul} />
}
