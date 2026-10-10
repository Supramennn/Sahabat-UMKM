import type { Transaction } from '@sahabat/db'

/**
 * Nomor dokumen (KEPUTUSAN-TEKNIS bagian 3).
 *
 * Formatnya PO-2026-0001, GR-2026-0001, PR-2026-0001, dan PAY-2026-0001, dengan
 * urutan per workspace per tahun. Urutannya diambil dari tabel document_sequences,
 * bukan dari sequence PostgreSQL, karena sequence bersifat global: dua workspace
 * saling mengambil nomor, dan nomor per tahun tidak bisa diketahui tanpa menghitung
 * ulang dari nol.
 *
 * Baris urutan dikunci saat nomor diambil. Tanpa itu, dua PO yang dibuat pada saat
 * bersamaan bisa mendapat nomor sama, dan penolakan batasan unik terjadi setelah
 * nomor terlanjur dikomunikasikan ke pengguna.
 */

export type DocumentKind = 'po' | 'penerimaan' | 'retur' | 'pembayaran'

export const documentPrefixes: Record<DocumentKind, string> = {
  po: 'PO',
  penerimaan: 'GR',
  retur: 'PR',
  pembayaran: 'PAY',
}

export async function allocateDocumentNumber(
  tx: Transaction,
  workspaceId: number,
  kind: DocumentKind,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear()

  await tx.query(
    `insert into document_sequences (workspace_id, kind, year, last_number)
     values ($1, $2, $3, 0)
     on conflict (workspace_id, kind, year) do nothing`,
    [workspaceId, kind, year],
  )

  const sequence = await tx.query<{ last_number: number }>(
    `update document_sequences set last_number = last_number + 1
      where workspace_id = $1 and kind = $2 and year = $3
      returning last_number`,
    [workspaceId, kind, year],
  )

  const next = Number(sequence.rows[0]?.last_number ?? 0)
  const urut = String(next).padStart(4, '0')

  return `${documentPrefixes[kind]}-${year}-${urut}`
}

/** Tanggal kalender menurut zona waktu workspace (B-10). */
export async function todayInWorkspace(
  tx: Pick<Transaction, 'query'>,
  workspaceId: number,
): Promise<Date> {
  const result = await tx.query<{ today: string }>(
    `select to_char(
              now() at time zone (select timezone from workspaces where id = $1),
              'YYYY-MM-DD'
            ) as today`,
    [workspaceId],
  )
  const today = result.rows[0]?.today
  return today ? new Date(`${today}T00:00:00.000Z`) : new Date()
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}
