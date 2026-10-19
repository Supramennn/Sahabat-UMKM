'use client'

import { useCallback, useEffect, useState } from 'react'
import { can } from '@sahabat/shared'
import {
  apiGet,
  apiPost,
  API_BASE,
  errorMessage,
  type BillingPeriod,
  type CheckoutResponse,
  type PaymentItem,
  type PaymentsResponse,
  type SubscriptionResponse,
} from '../../../lib/api'
import { cx } from '../../../lib/cx'
import { Alert, Button, ErrorState } from '../../components/ui'
import { AppProvider, useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'

type PaidPlan = 'usaha' | 'bisnis'

const rupiah = (amount: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(amount)

const tanggal = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value))

const fieldClass = 'min-h-touch rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary'

const labelMasa: Record<BillingPeriod, string> = { bulanan: 'bulanan', tahunan: 'tahunan' }

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
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState<BillingPeriod>('bulanan')
  const [kembaliDariPembayaran, setKembaliDariPembayaran] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await apiGet<SubscriptionResponse>(`/api/workspaces/${app.workspaceId}/subscription`)
    if (!result.ok) {
      setLoading(false)
      setError(errorMessage(result.error, 'Informasi paket tidak bisa dimuat.'))
      return
    }
    setData(result.data)

    if (manage) {
      const list = await apiGet<PaymentsResponse>(`/api/workspaces/${app.workspaceId}/subscription/payments`)
      setPayments(list.ok ? list.data.payments : [])
    } else {
      setPayments([])
    }

    setError(null)
    setLoading(false)
  }, [app.workspaceId, manage])

  useEffect(() => { void load() }, [load])

  // Tautan "selesai" dari halaman pembayaran Midtrans membawa nomor baris
  // pembayaran; statusnya sendiri selalu datang dari notifikasi gateway, jadi
  // halaman ini hanya perlu memuat ulang riwayat.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment')) {
      setKembaliDariPembayaran(true)
    }
  }, [])

  async function choose(code: 'gratis' | PaidPlan) {
    setSaving(true)
    setMessage(null)
    setError(null)
    const result = await apiPost<{ subscription: { plan: string; status: string } }>(
      `/api/workspaces/${app.workspaceId}/subscription/plan`, { plan: code },
    )
    setSaving(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Paket tidak bisa diubah.'))
      return
    }
    setMessage(result.data.subscription.status === 'uji_coba'
      ? 'Uji coba paket dimulai. Setelah 14 hari, paket kembali ke Gratis jika pembayaran belum diterima.'
      : 'Paket workspace sudah diubah ke Gratis. Sisa masa berbayar tidak dipakai lagi.')
    await load()
  }

  async function checkout(code: PaidPlan) {
    setSaving(true)
    setMessage(null)
    setError(null)
    const result = await apiPost<CheckoutResponse>(
      `/api/workspaces/${app.workspaceId}/subscription/checkout`, { plan: code, period },
    )
    setSaving(false)
    if (!result.ok) {
      setError(errorMessage(result.error, 'Tagihan tidak bisa dibuat.'))
      return
    }
    setMessage(
      `Tagihan ${result.data.payment.number} sebesar ${rupiah(result.data.payment.amount)} sudah dibuat. ` +
      'Selesaikan pembayaran dari panel menunggu pembayaran di bawah.',
    )
    await load()
  }

  async function downloadInvoice(payment: PaymentItem) {
    setInvoiceError(null)
    try {
      const response = await fetch(
        `${API_BASE}/api/workspaces/${app.workspaceId}/subscription/payments/${payment.id}/invoice.pdf`,
        { credentials: 'include' },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        setInvoiceError(body.message ?? 'Faktur tidak dapat diunduh.')
        return
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
        ?? `${payment.number}.pdf`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setInvoiceError('Tidak bisa menghubungi server untuk mengunduh faktur.')
    }
  }

  const subscription = data?.subscription
  const trialAktif = subscription?.status === 'uji_coba' && subscription.plan !== 'gratis'
  const periodAktif = Boolean(subscription?.currentPeriodEnd)
  const trialTersedia = Boolean(subscription) && !subscription!.trialUsed && !trialAktif && !periodAktif
  const pending = payments.find((payment) => payment.status === 'menunggu') ?? null

  function hargaTampil(monthly: number): { utama: string; keterangan: string | null } {
    if (monthly === 0) return { utama: 'Rp0', keterangan: null }
    if (!data?.billingEnabled || period === 'bulanan') {
      return { utama: `${rupiah(monthly)} / bulan`, keterangan: null }
    }
    const total = monthly * data.billing.yearlyMonths
    return { utama: `${rupiah(total)} / tahun`, keterangan: `12 bulan dengan harga ${data.billing.yearlyMonths} bulan` }
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
        {kembaliDariPembayaran ? <Alert kind="info">Kembali dari halaman pembayaran. Status terbaru ada di riwayat pembayaran di bawah.</Alert> : null}
        {message ? <Alert kind="success">{message}</Alert> : null}
        {invoiceError ? <Alert kind="error">{invoiceError}</Alert> : null}
        {!loading && data ? <>
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" aria-labelledby="current-plan">
            <div>
              <h2 className="text-lg font-semibold" id="current-plan">Paket saat ini: {data.plans.find((plan) => plan.code === data.subscription.plan)?.name}</h2>
              <p className="text-[0.9375rem] text-text-secondary">
                {data.subscription.status === 'uji_coba' && data.subscription.trialEndsAt
                  ? `Uji coba berakhir ${tanggal(data.subscription.trialEndsAt)}.`
                  : data.subscription.currentPeriodEnd
                    ? `Langganan ${data.subscription.billingPeriod ? labelMasa[data.subscription.billingPeriod] : ''} aktif sampai ${tanggal(data.subscription.currentPeriodEnd)}.`
                    : 'Paket aktif tanpa tagihan.'}
              </p>
            </div>
            {!manage ? <p className="text-[0.9375rem] text-text-secondary">Hanya Owner yang dapat mengubah paket dan langganan.</p> : null}
          </section>

          <div className="flex flex-col gap-2">
            <p className="text-[0.9375rem] text-text-secondary">
              {data.pricingNote}
              {data.billingEnabled
                ? ' Harga belum termasuk pajak yang berlaku.'
                : ' Pembayaran dan faktur belum diaktifkan. Paket berbayar dapat diuji selama 14 hari tanpa kartu.'}
            </p>
            {data.billingEnabled && data.billing.refundPolicyUrl ? (
              <p className="text-[0.9375rem] text-text-secondary">
                Baca{' '}
                <a className="text-secondary underline underline-offset-4 hover:text-secondary-deep" href={data.billing.refundPolicyUrl} target="_blank" rel="noreferrer">
                  kebijakan pengembalian dana
                </a>{' '}
                sebelum membayar.
              </p>
            ) : null}
          </div>

          {data.billingEnabled && manage ? (
            <div className="flex flex-wrap items-end gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-text-secondary" htmlFor="masa-pembayaran">Masa pembayaran</label>
                <select
                  className={fieldClass}
                  id="masa-pembayaran"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as BillingPeriod)}
                >
                  <option value="bulanan">Bulanan</option>
                  <option value="tahunan">Tahunan, 12 bulan</option>
                </select>
              </div>
              <p className="text-[0.9375rem] text-text-secondary">
                Harga tahunan setara {data.billing.yearlyMonths} bulan.
              </p>
            </div>
          ) : null}

          {manage && pending ? (
            <section className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" aria-labelledby="tagihan-menunggu">
              <h2 className="text-lg font-semibold" id="tagihan-menunggu">Menunggu pembayaran</h2>
              <p className="text-[0.9375rem] text-text-secondary">
                Tagihan {pending.number} untuk paket {pending.planName} {pending.periodLabel.toLowerCase()} sebesar {rupiah(pending.amount)}
                {', batas bayar '}{tanggal(pending.expiresAt)}.
              </p>
              <div className="flex flex-wrap gap-3">
                {pending.redirectUrl ? (
                  <Button type="button" onClick={() => window.location.assign(pending.redirectUrl as string)}>
                    Buka halaman pembayaran
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={pending.redirectUrl ? 'secondary' : 'primary'}
                  onClick={() => {
                    // Pesan checkout lama dibuang: setelah statusnya diperiksa,
                    // tagihannya bisa sudah lunas dan ajakan membayar itu keliru.
                    setMessage(null)
                    void load()
                  }}
                >
                  Periksa status
                </Button>
              </div>
              {data.billingEnabled && data.billing.refundPolicyUrl ? (
                <p className="text-[0.9375rem] text-text-secondary">
                  Dengan membayar, Anda menyetujui{' '}
                  <a className="text-secondary underline underline-offset-4 hover:text-secondary-deep" href={data.billing.refundPolicyUrl} target="_blank" rel="noreferrer">
                    kebijakan pengembalian dana
                  </a>.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-4 min-[46rem]:grid-cols-2 min-[76rem]:grid-cols-3">
            {data.plans.map((plan) => {
              const current = plan.code === data.subscription.plan
              const harga = hargaTampil(plan.proposedMonthlyPrice)
              // Tagihan hanya untuk paket berbayar; kode dipisah supaya
              // pemeriksa tipe tahu `checkout` tidak pernah menerima Gratis.
              const kodeBayar: PaidPlan | null = plan.code === 'gratis' ? null : plan.code
              return <section className="flex min-w-0 flex-col gap-4 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" key={plan.code} aria-labelledby={`plan-${plan.code}`}>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3">
                  <div>
                    <h2 className="text-lg font-semibold" id={`plan-${plan.code}`}>{plan.name}</h2>
                    <p className="mt-1 text-lg tabular">{harga.utama}</p>
                    {harga.keterangan ? <p className="text-sm text-text-secondary">{harga.keterangan}</p> : null}
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
                {manage ? <div className="mt-auto flex flex-wrap items-center gap-3">
                  {kodeBayar === null ? (
                    <Button type="button" variant="secondary" disabled={saving || current} onClick={() => void choose('gratis')}>
                      {periodAktif && !current ? 'Turunkan ke Gratis sekarang' : 'Pilih Gratis'}
                    </Button>
                  ) : <>
                    {data.billingEnabled ? (
                      <Button type="button" disabled={saving} onClick={() => void checkout(kodeBayar)}>
                        {periodAktif && current ? 'Perpanjang' : trialAktif && current ? 'Langganan sekarang' : `Bayar paket ${plan.name}`}
                      </Button>
                    ) : null}
                    {trialTersedia ? (
                      <Button type="button" variant={data.billingEnabled ? 'secondary' : 'primary'} disabled={saving} onClick={() => void choose(kodeBayar)}>
                        Mulai uji coba 14 hari
                      </Button>
                    ) : null}
                    {!trialTersedia && subscription?.trialUsed && !periodAktif && !trialAktif ? (
                      <p className="text-[0.9375rem] text-text-secondary">Uji coba sudah digunakan.</p>
                    ) : null}
                  </>}
                </div> : null}
              </section>
            })}
          </div>

          {manage ? (
            <section className="flex flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised" aria-labelledby="riwayat-pembayaran">
              <h2 className="text-lg font-semibold" id="riwayat-pembayaran">Riwayat pembayaran</h2>
              {payments.length === 0 ? (
                <p className="text-[0.9375rem] text-text-secondary">
                  {data.billingEnabled
                    ? 'Belum ada tagihan. Tagihan muncul di sini setelah Anda memilih paket berbayar.'
                    : 'Belum ada tagihan, dan pembayaran belum diaktifkan.'}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-subtle">
                  {payments.map((payment) => (
                    <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={payment.id}>
                      <div className="min-w-0">
                        <p className="font-semibold tabular">{payment.number}</p>
                        <p className="text-[0.9375rem] text-text-secondary">
                          {tanggal(payment.paidAt ?? payment.createdAt)} · Paket {payment.planName} {payment.periodLabel.toLowerCase()}
                          {payment.paymentMethodLabel ? ` · ${payment.paymentMethodLabel}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="tabular">{rupiah(payment.amount)}</span>
                        <span className={cx(
                          'rounded-badge border px-2 py-0.5 text-xs font-medium',
                          payment.status === 'dibayar'
                            ? 'border-success bg-success-muted text-success-ink'
                            : 'border-border-strong bg-background text-text-primary',
                        )}>
                          {payment.statusLabel}
                        </span>
                        {payment.status === 'dibayar' ? (
                          <Button type="button" variant="secondary" onClick={() => void downloadInvoice(payment)}>
                            Unduh faktur
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </> : null}
      </div>
    </AppShell>
  )
}
