'use client'

import { useCallback, useEffect, useState } from 'react'
import { can } from '@sahabat/shared'
import { apiGet, apiPost, errorMessage, type SubscriptionResponse } from '../../../lib/api'
import { Alert, Button, ErrorState } from '../../components/ui'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import styles from './page.module.css'

const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount)

export default function PlansPage() {
  return (
    <AppProvider>
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
      <div className={styles.page}>
        {loading ? <p role="status">Memuat informasi paket.</p> : null}
        {error ? <ErrorState title="Paket tidak bisa dimuat atau diubah" body={error} action={<Button type="button" variant="secondary" onClick={() => void load()}>Coba lagi</Button>} /> : null}
        {message ? <Alert kind="success">{message}</Alert> : null}
        {!loading && data ? <>
          <section className={styles.current} aria-labelledby="current-plan">
            <div>
              <h2 id="current-plan">Paket saat ini: {data.plans.find((plan) => plan.code === data.subscription.plan)?.name}</h2>
              <p>{data.subscription.status === 'uji_coba' && data.subscription.trialEndsAt
                ? `Uji coba berakhir ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(data.subscription.trialEndsAt))}.`
                : 'Paket aktif tanpa tagihan.'}</p>
            </div>
            {!manage ? <p>Hanya Owner yang dapat mengubah paket dan langganan.</p> : null}
          </section>

          <p className={styles.note}>{data.pricingNote} Pembayaran dan faktur belum diaktifkan. Paket berbayar dapat diuji selama 14 hari tanpa kartu.</p>

          <div className={styles.planList}>
            {data.plans.map((plan) => {
              const current = plan.code === data.subscription.plan
              return <section className={styles.plan} key={plan.code} aria-labelledby={`plan-${plan.code}`}>
                <header className={styles.planHeader}>
                  <div>
                    <h2 id={`plan-${plan.code}`}>{plan.name}</h2>
                    <p className={styles.price}>{plan.proposedMonthlyPrice === 0 ? 'Rp0' : `${rupiah(plan.proposedMonthlyPrice)} / bulan`}</p>
                  </div>
                  {current ? <span className={styles.status}>Paket saat ini</span> : null}
                </header>
                <dl className={styles.limits}>
                  <div><dt>Produk aktif</dt><dd>{plan.activeProducts.toLocaleString('id-ID')}</dd></div>
                  <div><dt>Anggota termasuk undangan</dt><dd>{plan.members}</dd></div>
                  <div><dt>Lokasi</dt><dd>{plan.locations}</dd></div>
                  <div><dt>Penjualan</dt><dd>{plan.sales ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div><dt>Retur dan utang supplier</dt><dd>{plan.returns ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div><dt>Stok opname</dt><dd>{plan.stocktake ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div><dt>Ekspor XLSX</dt><dd>{plan.xlsxExport ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div><dt>Approval PO berjenjang</dt><dd>{plan.multilevelApproval ? 'Tersedia' : 'Tidak tersedia'}</dd></div>
                  <div><dt>Riwayat audit</dt><dd>{plan.auditLogDays} hari</dd></div>
                </dl>
                {manage ? <div className={styles.action}>
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
