import type { Metadata } from 'next'
import { PageTransition } from '../components/motion'
import { SitusKaki, SitusKepala } from '../components/situs'
import { komponenStatus, leadStatus, rencanaStatus, riwayatStatus } from '../../lib/status'
import { catatanKaki, metadataSitus } from '../../lib/situs'

export const metadata: Metadata = metadataSitus({
  jalur: '/status',
  judul: 'Status Layanan - Sahabat UMKM',
  deskripsi: 'Keadaan layanan dengan data yang bisa dibuktikan, tanpa janji kontraktual.',
})

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-text-primary">
      <SitusKepala />
      <PageTransition className="flex flex-col">
        <main className="flex flex-col">
          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-14">
              <h1 className="max-w-[30rem] text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                Status Layanan
              </h1>
              <p className="mt-4 max-w-[46rem] text-lg text-text-secondary">{leadStatus}</p>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 sm:py-12">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">Keadaan per komponen</h2>
              <dl className="mt-4 max-w-[60rem] border-t border-border-subtle">
                {komponenStatus.map((komponen) => (
                  <div className="grid gap-1 border-b border-border-subtle py-4 min-[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[48rem]:gap-8" key={komponen.nama}>
                    <dt className="font-semibold text-text-primary">{komponen.nama}</dt>
                    <dd className="text-[0.9375rem] text-text-secondary">{komponen.keadaan}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="border-b border-border-subtle">
            <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-5 px-4 py-10 sm:px-6 sm:py-12">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-primary">Riwayat gangguan</h2>
                <p className="mt-2 max-w-[52rem] text-[0.9375rem] text-text-secondary">{riwayatStatus}</p>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-primary">Rencana pemantauan</h2>
                <p className="mt-2 max-w-[52rem] text-[0.9375rem] text-text-secondary">{rencanaStatus}</p>
              </div>
            </div>
          </section>
        </main>
      </PageTransition>
      <SitusKaki catatan={catatanKaki} />
    </div>
  )
}
