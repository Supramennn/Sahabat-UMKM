/**
 * Aturan pengeluaran (PRD 6.5).
 *
 * Satu aturan di sini dipakai server dan peramban, supaya pesan peringatan yang
 * muncul sebelum pengguna menekan tombol sama persis dengan yang diperiksa server.
 * Kalau keduanya punya daftar kata sendiri, salah satunya akan diam-diam berbeda,
 * dan yang berbeda itu justru bagian yang paling jarang diuji.
 */

/**
 * PRD 6.5: pembelian barang lewat PO tidak dicatat ulang sebagai pengeluaran.
 *
 * Daftar kata di bawah dibaca dari cara pemilik usaha menulis kategorinya, bukan
 * dari daftar kategori baku. "Bahan baku", "Stok dagangan", "Pembelian barang", dan
 * "Belanja stok" semua menyebut hal yang sama, yaitu barang yang masuk lewat PO.
 * Kata yang dipilih sengaja sempit supaya "Sewa kios", "Listrik", dan "Gaji" tidak
 * ikut diperingatkan hanya karena huruf yang kebetulan sama.
 */
const STOCK_PURCHASE_WORDS = [
  'pembelian',
  'beli',
  'belanja',
  'stok',
  'stock',
  'barang dagangan',
  'barangan',
  'bahan baku',
  'bahan',
  'produk',
  'dagangan',
  'inventory',
  'persediaan',
  'restock',
]

/** True kalau nama kategori terdengar seperti pembelian barang dagangan. */
export function looksLikeStockPurchase(categoryName: string): boolean {
  const normalized = categoryName.trim().toLowerCase()
  if (normalized === '') {
    return false
  }
  return STOCK_PURCHASE_WORDS.some((word) => normalized.includes(word))
}

/**
 * Pesan peringatan. Diformulasikan sebagai pertanyaan dan menyebut jalan keluarnya,
 * supaya pengguna tahu apa yang harus diperbaiki kalau memang keliru.
 */
export function stockPurchaseWarning(categoryName: string): string {
  return (
    `Kategori "${categoryName.trim()}" terdengar seperti pembelian barang dagangan. ` +
    'Barang yang dibeli lewat purchase order sudah menambah stok dan sudah tercatat ' +
    'sebagai pembelian, jadi mencatatnya lagi sebagai pengeluaran akan menghitung ' +
    'belanja dua kali. Kalau ini memang biaya lain, ganti kategorinya.'
  )
}