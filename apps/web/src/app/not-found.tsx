import styles from './not-found.module.css'

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Halaman tidak ditemukan</h1>
      <p className={styles.body}>
        Alamat yang Anda buka tidak tersedia. Periksa kembali tautannya, atau kembali ke beranda.
      </p>
      <a className={styles.link} href="/">
        Kembali ke beranda
      </a>
    </main>
  )
}
