export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[34rem] flex-col items-start justify-center gap-3 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-text-secondary">
        Alamat yang Anda buka tidak tersedia. Periksa kembali tautannya, atau kembali ke beranda.
      </p>
      <a className="inline-flex min-h-touch items-center justify-center rounded-control bg-secondary px-4 font-medium text-surface no-underline transition-colors hover:bg-secondary-deep" href="/">
        Kembali ke beranda
      </a>
    </main>
  )
}
