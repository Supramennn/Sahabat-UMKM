import { HalamanModulFitur, metadataModul } from '../halaman-modul'
import { modulBySlug } from '../../../lib/fitur'

/** Halaman fitur modul Langganan (PRD 11). */

const modul = modulBySlug('langganan')!

export const metadata = metadataModul(modul)

export default function Page() {
  return <HalamanModulFitur modul={modul} />
}
