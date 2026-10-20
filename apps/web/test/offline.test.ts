import { describe, expect, it } from 'vitest'
import {
  bacaAntreanStok,
  bacaDaftar,
  hapusCatatanAntrean,
  kirimAntreanStok,
  labelSalinan,
  simpanDaftar,
  tambahCatatanStok,
  ubahStatusAntrean,
  type PayloadStokOffline,
  type Penyimpanan,
} from '../src/lib/offline'

/**
 * PRD 10: isian yang dibuat saat offline masuk antrean dengan status terlihat
 * dan tidak pernah dianggap berhasil sebelum server mengonfirmasi. PRD 20:
 * mitigasi data ganda adalah antrean dengan idempotency.
 */

function penyimpananUji(): Penyimpanan & { peta: Map<string, string> } {
  const peta = new Map<string, string>()
  return {
    peta,
    getItem: (key) => peta.get(key) ?? null,
    setItem: (key, value) => { peta.set(key, value) },
    removeItem: (key) => { peta.delete(key) },
  }
}

const WS = 7

function payload(berbeda: Partial<PayloadStokOffline> = {}): PayloadStokOffline {
  return {
    productId: 42,
    locationId: 1,
    kind: 'masuk',
    quantity: '12',
    reasonCode: 'pembelian',
    reference: null,
    note: null,
    expiresAt: null,
    idempotencyKey: `offline-uji-${Math.random().toString(36).slice(2)}`,
    ...berbeda,
  }
}

function kirimSukses(balanceAfter = 21) {
  return async () => ({ ok: true as const, data: { balanceAfter, replayed: false } })
}

describe('antrean catatan stok offline (PRD 10)', () => {
  it('menyimpan, membaca, mengubah, dan menghapus entri', () => {
    const simpan = penyimpananUji()
    const entri = tambahCatatanStok({ workspaceId: WS, payload: payload(), penyimpanan: simpan })

    const hasil = bacaAntreanStok(simpan)
    expect(hasil).toHaveLength(1)
    expect(hasil[0]).toMatchObject({ id: entri.id, workspaceId: WS, status: 'menunggu', attempts: 0 })
    expect(hasil[0]!.payload.idempotencyKey).toBe(entri.payload.idempotencyKey)

    ubahStatusAntrean(entri.id, { status: 'gagal', pesanGagal: 'stok negatif', attempts: 3 }, simpan)
    const salah = bacaAntreanStok(simpan)[0]
    expect(salah!.status).toBe('gagal')
    expect(salah!.pesanGagal).toBe('stok negatif')
    expect(salah!.attempts).toBe(3)

    hapusCatatanAntrean(entri.id, simpan)
    expect(bacaAntreanStok(simpan)).toEqual([])
  })

  it('antrean yang rusak dibaca sebagai kosong', () => {
    const simpan = penyimpananUji()
    simpan.peta.set('sahabat-antrean-stok', '{bukan json')
    expect(bacaAntreanStok(simpan)).toEqual([])

    simpan.peta.set('sahabat-antrean-stok', JSON.stringify([{ id: 'x' }]))
    expect(bacaAntreanStok(simpan)).toEqual([])
  })

  it('tanpa penyimpanan, antrean kosong dan tidak ada yang dianggap terkirim', async () => {
    const hasil = await kirimAntreanStok({
      workspaceId: WS,
      kirim: kirimSukses(),
      penyimpanan: null,
    })
    expect(hasil).toMatchObject({ terkirim: 0, ditolak: 0, masihOffline: false })
  })

  it('kiriman yang dijawab server menghapus dari antrean', async () => {
    const simpan = penyimpananUji()
    const entri = tambahCatatanStok({ workspaceId: WS, payload: payload(), penyimpanan: simpan })

    const hasil = await kirimAntreanStok({ workspaceId: WS, kirim: kirimSukses(), penyimpanan: simpan })
    expect(hasil).toMatchObject({ terkirim: 1, ditolak: 0, masihOffline: false })
    expect(bacaAntreanStok(simpan)).toEqual([])

    // Pengiriman ulang yang punya kunci idempotensi akan dibatasi satu baris
    // ledger oleh server (PRD 6.4); di sini cukup dipastikan kuncinya tersimpan.
    expect(entri.payload.idempotencyKey.startsWith('offline-uji-')).toBe(true)
  })

  it('sinyal yang belum kembali menghentikan perulangan, status tetap menunggu', async () => {
    const simpan = penyimpananUji()
    const dua = [
      tambahCatatanStok({ workspaceId: WS, payload: payload(), penyimpanan: simpan }),
      tambahCatatanStok({ workspaceId: WS, payload: payload(), penyimpanan: simpan }),
    ]

    const hasil = await kirimAntreanStok({
      workspaceId: WS,
      kirim: async () => ({ ok: false as const, error: { error: 'jaringan', message: 'Tidak bisa menghubungi server.' } }),
      penyimpanan: simpan,
    })

    expect(hasil.terkirim).toBe(0)
    expect(hasil.masihOffline).toBe(true)
    const sisa = bacaAntreanStok(simpan)
    for (const entri of dua) {
      expect(sisa.find((item) => item.id === entri.id)!.status).toBe('menunggu')
    }
  })

  it('penolakan server menandai gagal beserta alasan, bukan menghapus diam-diam', async () => {
    const simpan = penyimpananUji()
    const entri = tambahCatatanStok({ workspaceId: WS, payload: payload(), penyimpanan: simpan })

    const hasil = await kirimAntreanStok({
      workspaceId: WS,
      kirim: async () => ({ ok: false as const, error: { error: 'saldo_negatif', message: 'Stok tidak boleh minus.' } }),
      penyimpanan: simpan,
    })

    expect(hasil.terkirim).toBe(0)
    expect(hasil.ditolak).toBe(1)
    const kembali = bacaAntreanStok(simpan).find((item) => item.id === entri.id)!
    expect(kembali.status).toBe('gagal')
    expect(kembali.pesanGagal).toBe('Stok tidak boleh minus.')
  })

  it('antrean dikirim per workspace dan tidak menyentuh workspace lain', async () => {
    const simpan = penyimpananUji()
    tambahCatatanStok({ workspaceId: 1, payload: payload(), penyimpanan: simpan })
    tambahCatatanStok({ workspaceId: 2, payload: payload(), penyimpanan: simpan })

    const yangDikirim: number[] = []
    const hasil = await kirimAntreanStok({
      workspaceId: 1,
      kirim: async (payloadTerkirim) => {
        yangDikirim.push(payloadTerkirim.productId)
        return { ok: true as const, data: { balanceAfter: 3, replayed: true } }
      },
      penyimpanan: simpan,
    })

    expect(yangDikirim).toEqual([42])
    expect(hasil.terkirim).toBe(1)
    const sisa = bacaAntreanStok(simpan)
    expect(sisa).toHaveLength(1)
    expect(sisa[0]!.workspaceId).toBe(2)
  })

  it('salinan daftar barang dan lokasi disimpan dengan waktunya', () => {
    const simpan = penyimpananUji()

    expect(bacaDaftar({ workspaceId: WS, kunci: 'produk', penyimpanan: simpan })).toBeNull()

    simpanDaftar({ workspaceId: WS, kunci: 'produk', data: { products: [1, 2] }, penyimpanan: simpan })
    const salinan = bacaDaftar<{ products: number[] }>({ workspaceId: WS, kunci: 'produk', penyimpanan: simpan })
    expect(salinan!.data.products).toEqual([1, 2])
    expect(salinan!.disimpanPada).toBeTruthy()

    simpan.peta.set(`sahabat-draf-daftar:${WS}:produk`, 'nonsense')
    expect(bacaDaftar({ workspaceId: WS, kunci: 'produk', penyimpanan: simpan })).toBeNull()
  })

  it('label salinan menampilkan waktu yang bisa dibaca atau kosong bila tak valid', () => {
    expect(labelSalinan(new Date(2026, 9, 20, 14, 5).toISOString())).toContain('2026')
    expect(labelSalinan('bukan-waktu')).toBe('')
  })
})
