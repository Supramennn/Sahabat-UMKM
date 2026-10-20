import type { Database } from '@sahabat/db'

/**
 * Daftar periksa aktivasi (PRD 12).
 *
 * Alur aktivasi pada PRD 12 adalah: daftar, verifikasi email, buat workspace,
 * isi nama dan jenis usaha, masukkan produk, atur stok awal dan batas minimum,
 * catat transaksi pertama. Tiga langkah pertama selesai di halaman
 * autentikasi, jadi daftar di sini berisi empat langkah setelahnya.
 *
 * Keadaan selesai dihitung dari data, bukan dikotak-kotakkan saat pengguna
 * menekan tombol, jadi daftar tidak bisa berpura-pura selesai. Batas minimum
 * produk serta saldo awal masing-masing punya tanda gagal sendiri supaya
 * detailnya menyebut sisa kerja yang benar-benar belum dikerjakan.
 */

export const LANGKAH_AKTIVASI = ['profil_usaha', 'produk', 'stok_awal', 'transaksi'] as const

export type LangkahAktivasi = (typeof LANGKAH_AKTIVASI)[number]

export interface LangkahChecklist {
  key: LangkahAktivasi
  label: string
  detail: string
  href: string
  /** Daftar kerja yang belum selesai di dalam langkah ini. Kosong saat selesai. */
  sisa: string[]
  done: boolean
  skipped: boolean
}

export interface ChecklistAktivasi {
  langkah: LangkahChecklist[]
  semuaSelesai: boolean
}

const KERENGA: Record<LangkahAktivasi, { label: string; href: string }> = {
  profil_usaha: { label: 'Isi nama dan jenis usaha', href: '/pengaturan/usaha' },
  produk: { label: 'Masukkan daftar barang pertama', href: '/stok/produk/baru' },
  stok_awal: { label: 'Atur saldo awal dan batas minimum', href: '/stok/input' },
  transaksi: { label: 'Catat transaksi pertama', href: '/penjualan/baru' },
}

export async function muatChecklistAktivasi(
  db: Database,
  workspaceId: number,
): Promise<ChecklistAktivasi> {
  const [profil, produk, stokAwal, transaksi, skips] = await Promise.all([
    db.query<{ business_type: string | null }>(
      'select business_type from workspaces where id = $1',
      [workspaceId],
    ),
    db.query<{ ada: boolean }>(
      `select exists (
         select 1 from products
          where workspace_id = $1 and status = 'aktif'
       ) as ada`,
      [workspaceId],
    ),
    db.query<{ adaMasuk: boolean; adaBatas: boolean }>(
      `select exists (
         select 1 from stock_movements where workspace_id = $1 and direction = 'tambah'
       ) as "adaMasuk",
       exists (
         select 1 from products p
          where p.workspace_id = $1 and p.status = 'aktif' and p.min_stock is not null
       ) as "adaBatas"`,
      [workspaceId],
    ),
    db.query<{ adaJual: boolean; adaTerima: boolean; adaKeluar: boolean }>(
      `select exists (
         select 1 from sales where workspace_id = $1 and status = 'selesai'
       ) as "adaJual",
       exists (select 1 from goods_receipts where workspace_id = $1) as "adaTerima",
       exists (
         select 1 from stock_movements where workspace_id = $1 and direction = 'kurang'
       ) as "adaKeluar"`,
      [workspaceId],
    ),
    db.query<{ step: string }>(
      'select step from workspace_onboarding_skips where workspace_id = $1',
      [workspaceId],
    ),
  ])

  const melewatkan = new Set(skips.rows.map((row) => row.step))

  const sisa: Record<LangkahAktivasi, string[]> = {
    profil_usaha: profil.rows[0]?.business_type ? [] : ['Tetapkan jenis usaha, misalnya kedai kopi atau toko retail.'],
    produk: produk.rows[0]?.ada ? [] : ['Daftar barang masih kosong. Tulis barang pertama manual atau impor berkas.'],
    stok_awal: [
      ...(stokAwal.rows[0]?.adaMasuk ? [] : ['Belum ada catatan stok masuk. Catat saldo awal lewat Catat stok atau impor saldo awal.']),
      ...(stokAwal.rows[0]?.adaBatas ? [] : ['Batas minimum belum diisi pada satu barang pun.']),
    ],
    transaksi: transaksi.rows[0]?.adaJual || transaksi.rows[0]?.adaTerima || transaksi.rows[0]?.adaKeluar
      ? []
      : ['Catat penjualan, penerimaan barang, atau penyesuaian stok pertama.'],
  }

  const langkah = LANGKAH_AKTIVASI.map((key) => {
    const kerenga = sisa[key]
    return {
      key,
      label: KERENGA[key].label,
      href: KERENGA[key].href,
      detail: DETAIL[key],
      sisa: kerenga,
      done: kerenga.length === 0,
      skipped: melewatkan.has(key),
    }
  })

  return {
    langkah,
    semuaSelesai: langkah.every((item) => item.done || item.skipped),
  }
}

const DETAIL: Record<LangkahAktivasi, string> = {
  profil_usaha: 'Diatur di halaman Profil usaha.',
  produk: 'Bisa ditulis satu per satu manual atau diimpor dari berkas CSV dan XLSX.',
  stok_awal: 'Catat stok masuk pertama, lalu isi batas minimum per barang untuk peringatan stok rendah.',
  transaksi: 'Penjualan, penerimaan barang, atau catatan stok lainnya sama-sama dihitung.',
}
