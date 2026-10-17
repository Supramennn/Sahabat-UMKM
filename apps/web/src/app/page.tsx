/**
 * Halaman akar sementara. Situs publik dibangun di Fase 12, jadi yang ada di sini
 * hanya kerangka yang harus bisa dijalankan dan diperiksa. Halaman ini menyatakan
 * dirinya sebagai kerangka, bukan beranda produk.
 */
export default function Page() {
  return (
    <main className="flex min-h-dvh items-start justify-center p-4 sm:p-8">
      <div className="flex w-full max-w-[34rem] flex-col gap-3 rounded-surface border border-border-subtle bg-surface p-6 shadow-raised sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sahabat UMKM</h1>
        <p className="text-[0.9375rem] text-text-secondary">
          Aplikasi sudah berjalan. Halaman publik, pusat bantuan, dan halaman status menyusul
          pada fase berikutnya.
        </p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border-subtle pt-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-sm text-text-secondary">Tahap sekarang</dt>
          <dd className="tabular">Fase 8 selesai; berikutnya impor lengkap</dd>
          <dt className="text-sm text-text-secondary">Target sentuh</dt>
          <dd className="tabular">44 x 44 px</dd>
          <dt className="text-sm text-text-secondary">Tema</dt>
          <dd className="tabular">Terang saja, sesuai PRD 10</dd>
        </dl>
      </div>
    </main>
  )
}
