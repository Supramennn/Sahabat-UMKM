import styles from './page.module.css'

/**
 * Halaman akar sementara. Situs publik dibangun di Fase 7, jadi yang ada di sini
 * hanya kerangka yang harus bisa dijalankan dan diperiksa. Halaman ini menyatakan
 * dirinya sebagai kerangka, bukan beranda produk.
 */
export default function Page() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sahabat UMKM</h1>
        <p className={styles.body}>
          Fondasi aplikasi sudah berjalan. Modul stok, pembelian, penjualan, dan laporan belum
          dibuat.
        </p>
        <dl className={styles.list}>
          <dt className={styles.term}>Tahap sekarang</dt>
          <dd className={styles.detail}>Fase 0, fondasi</dd>
          <dt className={styles.term}>Target sentuh</dt>
          <dd className={styles.detail}>44 x 44 px</dd>
          <dt className={styles.term}>Tema</dt>
          <dd className={styles.detail}>Terang saja, sesuai PRD 10</dd>
        </dl>
      </div>
    </main>
  )
}
