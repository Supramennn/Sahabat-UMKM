import { HalamanModulFitur, metadataModul } from '../halaman-modul'
import { modulBySlug } from '../../../lib/fitur'

/** Halaman fitur modul Laporan dan dashboard (PRD 11). */

const modul = modulBySlug('laporan')!

export const metadata = metadataModul(modul)

export default function Page() {
  return <HalamanModulFitur modul={modul} />
}
