'use client'

import { useCallback, useEffect, useState } from 'react'
import { can } from '@sahabat/shared'
import { apiGet, apiPost, errorMessage, type SubscriptionResponse } from '../../../lib/api'
import { Alert, Button, ErrorState } from '../../components/ui'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'

const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount)

export default function PlansPage() {
  return (
    <AppProvider title="Paket dan langganan">
      <PlansPageContent />
    </AppProvider>
  )
}

function PlansPageContent() {
  const app = useApp()
  const manage = can(app.role, 'subscription.manage')
  const [data, setData] = useState<SubscriptionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<SubscriptionResponse>(`/api/workspaces/${app.workspaceId}/subscription`)
    setLoading(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Informasi paket tidak bisa dimuat.'))
      return
    }
    setError(null)
    setData(result.data)
  }, [app.workspaceId])

  useEffect(() => { void load() }, [load])

  async function choose(code: 'gratis' | 'usaha' | 'bisnis') {
    setSaving(true)
    setMessage(null)
    setError(null)
    const result = await apiPost<{ subscription: { plan: string; status: string }; billingEnabled: false }>(
      `/api/workspaces/${app.workspaceId}/subscription/plan`, { plan: code },
    )
    setSaving(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Paket tidak bisa diubah.'))
      return
    }
    setMessage(result.data.subscription.status === 'uji_coba'
      ? 'Uji coba paket dimulai. Setelah 14 hari, paket kembali ke Gratis jika pembayaran belum tersedia.'
      : 'Paket workspace sudah diubah ke Gratis.')
    await load()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/pengaturan/paket"
      breadcrumb="Pengaturan"
      title="Paket dan langganan"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {loading ? <p className="rounded-surface border border-border-subtle bg-surface p-4 text-[0.9375rem] text-text-secondary shadow-raised" role="status">Memuat informasi paket.</p> : null}
        {error ? <ErrorState title="Paket tidak bisa dimuat atau diubah" body={error} action={<Button type="button" variant="secondary" onClick={() => void load()}>Coba lagi</Button>} /> : null}
        {message ? <Alert kind="success">{message}</Alert> : null}
        {!loading && data ? <>
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" aria-labelledby="current-plan">
            <div>
              <h2 className="text-lg font-semibold" id="current-plan">Paket saat ini: {data.plans.find((plan) => plan.code === data.subscription.plan)?.name}</h2>
              <p className="text-[0.9375rem] text-text-secondary">{data.subscription.status === 'uji_coba' && data.subscription.trialEndsAt
                ? `Uji coba berakhir ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(data.subscription.trialEndsAt))}.`
                : 'Paket aktif tanpa tagihan.'}</p>
            </div>
            {!manage ? <p className="text-[0.9375rem] text-text-secondary">Hanya Owner yang dapat mengubah paket dan langganan.</p> : null}
          </section>

          <p className="text-[0.9375rem] text-text-secondary">{data.pricingNote} Pembayaran dan faktur belum diaktifkan. Paket berbayar dapat diuji selama 14 hari tanpa kartu.</p>

          <div className="grid grid-cols-1 gap-4 min-[46rem]:grid-cols-2 min-[76rem]:grid-cols-3">
            {data.plans.map((plan) => {
              const current = plan.code === data.subscription.plan
              return <section className="flex min-w-0 flex-col gap-4 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" key={plan.code} aria-labelledby={`plan-${plan.code}`}>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3">
                  <div>
                    <h2 className="text-lg font-semibold" id={`plan-${plan.code}`}>{plan.name}</h2>
                    <p className="mt-1 text-lg tabular">{plan.proposedMonthlyPrice === 0 ? 'Rp0' : `${rupiah(plan.proposedMonthlyPrice)} / bulan`}</p>
                  </div>
                  {current ? <span className="self-start rounded-badge border border-success bg-success-muted px-2 py-0.5 text-xs font-medium text-success-ink">Paket saat ini</span> : null}
                </header>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2">
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Produk aktif</dt><dd className="text-right font-semibold tabular">{plan.activeProducts.toLocaleString('id-ID')}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Anggota termasuk undangan</dt><dd className="text-right font-semibold tabular">{plan.members}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Lokasi</dt><dd className="text-right font-semibold tabular">{plan.locations}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Penjualan</dt><dd className="text-right font-semibold tabular">{plan.sales ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Retur dan utang supplier</dt><dd className="text-right font-semibold tabular">{plan.returns ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Stok opname</dt><dd className="text-right font-semibold tabular">{plan.stocktake ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Ekspor XLSX</dt><dd className="text-right font-semibold tabular">{plan.xlsxExport ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Approval PO berjenjang</dt><dd className="text-right font-semibold tabular">{plan.multilevelApproval ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div className="flex justify-between gap-2 border-b border-border-subtle pb-1"><dt className="text-text-secondary">Riwayat audit</dt><dd className="text-right font-semibold tabular">{plan.auditLogDays} hari</dd></div>
                </dl>
                {manage ? <div className="mt-auto">
                  {plan.code === 'gratis' ? <Button type="button" variant="secondary" disabled={saving || current} onClick={() => void choose('gratis')}>Pilih Gratis</Button>
                    : <Button type="button" disabled={saving || current || data.subscription.status === 'uji_coba' || data.subscription.trialUsed} onClick={() => void choose(plan.code)}>
                      {current ? 'Paket aktif' : data.subscription.trialUsed ? 'Uji coba sudah digunakan' : 'Mulai uji coba 14 hari'}
                    </Button>}
                </div> : null}
              </section>
            })}
          </div>
        </> : null}
      </div>
    </AppShell>
  )
}
