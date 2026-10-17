'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import { apiGet, errorMessage, type AlertsResponse, type StockAlert } from '../../../lib/api'
import { formatQty } from '../bagian'

/**
 * PRD 6.2: peringatan stok rendah dan hampir kedaluwarsa memakai batas yang diatur
 * per produk. Batas minimum ada di setiap barang, sedangkan jendela kedaluwarsa
 * belum ditetapkan PRD, jadi dipilih pengguna dari 7, 30, dan 90 hari.
 *
 * PRD 6.3: daftar ini juga jadi bahan awal untuk membuat purchase order langsung
 * dari stok rendah. Jumlah usulannya bisa diubah, dan satu barang yang muncul di
 * beberapa lokasi digabung supaya PO tidak memuat barang yang sama dua kali,
 * yang ditolak server.
 */

const JENDELA_HARI = [7, 30, 90] as const

interface Usulan {
  productId: number
  productName: string
  sku: string
  unitCode: string
  /** Batas minimum, dipakai sebagai jumlah usulan awal. */
  saran: number
  /** Nama lokasi yang membuat barang ini masuk daftar. */
  lokasi: string[]
}
export default function StockAlertsPage() {
  const app = useApp()
  const router = useRouter()

  const [alerts, setAlerts] = useState<StockAlert[] | null>(null)
  const [withinDays, setWithinDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dipilih, setDipilih] = useState<Record<number, string>>({})

  useEffect(() => {
    let berhenti = false
    setLoading(true)

    void apiGet<AlertsResponse>(
      `/api/workspaces/${app.workspaceId}/stock/alerts?withinDays=${withinDays}`,
    ).then((result) => {
      if (berhenti) return
      if (result.ok) {
        setAlerts(result.data.alerts)
        setError(null)
      } else {
        setError(errorMessage(result.error, 'Daftar peringatan tidak bisa dimuat.'))
      }
      setLoading(false)
    })

    return () => {
      berhenti = true
    }
  }, [app.workspaceId, withinDays])

  // Satu barang bisa muncul di beberapa lokasi, jadi usulannya digabung per
  // barang. Server menolak barang yang sama muncul dua kali dalam satu PO.
  const usulan = useMemo<Usulan[]>(() => {
    const gabungan = new Map<number, Usulan>()

    for (const item of alerts ?? []) {
      const ada = gabungan.get(item.productId)
      if (ada) {
        ada.lokasi.push(item.locationName)
        continue
      }

      gabungan.set(item.productId, {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unitCode: item.unitCode,
        // Barang yang kosong stok dan tidak punya batas minimum tetap butuh usulan,
        // jadi diambil dari satu sak atau satu pcs.
        saran: item.minStock && item.minStock > 0 ? item.minStock : 1,
        lokasi: [item.locationName],
      })
    }

    return [...gabungan.values()]
  }, [alerts])

  useEffect(() => {
    setDipilih(Object.fromEntries(usulan.map((item) => [item.productId, item.saran.toString()])))
  }, [usulan])

  const terpilih = usulan.filter((item) => (dipilih[item.productId] ?? '') !== '')
  const totalDipilih = terpilih.length

  function buatPO() {
    // Usulan dikirim lewat segmen URL supaya alamatnya bisa ditandai dan dibuka
    // ulang tanpa kehilangan isi.
    const segmen = terpilih
      .map((item) => `${item.productId}:${dipilih[item.productId]}`)
      .join(';')
    router.push(`/pembelian/po/baru?items=${encodeURIComponent(segmen)}`)
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/peringatan"
      breadcrumb="Stok"
      title="Perlu perhatian"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 grow basis-48 flex-col gap-1">
          <label className="text-sm text-text-secondary" htmlFor="jendela">
            Hampir kedaluwarsa dalam
          </label>
          <select
            className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
            id="jendela"
            value={withinDays}
            onChange={(event) => setWithinDays(Number(event.target.value))}
          >
            {JENDELA_HARI.map((hari) => (
              <option key={hari} value={hari}>
                {hari} hari
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <ErrorState title="Peringatan gagal dimuat" body={error} /> : null}

      {loading ? (
        <p
          className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised"
          role="status"
        >
          Memuat daftar peringatan.
        </p>
      ) : alerts && alerts.length === 0 ? (
        <div className="rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
          <p className="font-semibold">Tidak ada yang perlu diperhatikan</p>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Tidak ada barang yang habis, menyentuh batas minimum, atau hampir kedaluwarsa
            dalam {withinDays} hari ke depan. Daftar ini diperbarui setiap kali Anda mencatat
            stok.
          </p>
        </div>
      ) : null}

      {!loading && usulan.length > 0 ? (
        <>
          <p className="text-sm text-text-secondary">
            {totalDipilih > 0
              ? `${totalDipilih} barang dipilih untuk di-usulkan dalam PO. Jumlahnya masih bisa diubah.`
              : 'Kosongkan jumlah untuk barang yang tidak mau dipesan.'}
          </p>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {usulan.map((item) => (
              <li
                key={item.productId}
                className="flex flex-col gap-1 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[1.0625rem] font-semibold text-primary">
                    {item.productName}
                  </span>
                  <span className="text-sm text-text-secondary">{item.sku}</span>
                </span>

                <span className="text-sm text-text-secondary">
                  {item.lokasi.join(', ')} · {item.unitCode}
                </span>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-text-secondary" htmlFor={`usulan-${item.productId}`}>
                    Jumlah yang dipesan (batas minimum {formatQty(item.saran)})
                  </label>
                  <input
                    className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base transition-colors hover:border-text-secondary"
                    id={`usulan-${item.productId}`}
                    inputMode="decimal"
                    value={dipilih[item.productId] ?? ''}
                    onChange={(event) =>
                      setDipilih({ ...dipilih, [item.productId]: event.target.value })
                    }
                  />
                </div>

                <span className="text-sm text-text-secondary">
                  {(dipilih[item.productId] ?? '') === ''
                    ? 'Tidak ikut dipesan. Kosongkan kolomnya.'
                    : `${formatQty(Number(dipilih[item.productId]))} ${item.unitCode} akan masuk PO.`}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-control border border-transparent bg-secondary px-4 font-medium text-surface transition-colors enabled:hover:bg-secondary-deep disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface"
              disabled={totalDipilih === 0}
              onClick={buatPO}
            >
              Buat PO dari {totalDipilih} barang terpilih
            </button>
          </div>

          {totalDipilih > 0 ? (
            <Alert kind="info">
              Harga beli per barang belum diisi, jadi isi di halaman PO sebelum menyimpan.
            </Alert>
          ) : null}
        </>
      ) : null}
    </AppShell>
  )
}
