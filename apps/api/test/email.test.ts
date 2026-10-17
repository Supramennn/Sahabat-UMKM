import { afterEach, describe, expect, it } from 'vitest'
import { createLogEmailProvider } from '../src/services/email.ts'

/**
 * PRD 9: token tidak boleh masuk log produksi. Di pengembangan isi pesan justru
 * harus tercatat, karena tanpa layanan email hanya itu cara memakai tautan
 * verifikasi saat mencoba aplikasi secara lokal.
 */

const PESAN = {
  to: 'pemilik@contoh.test',
  subject: 'Verifikasi email Anda di Sahabat UMKM',
  body: 'Buka tautan ini untuk memverifikasi email: http://localhost:3000/verifikasi-email?token=rahasia-uji',
}

const semula = process.env.NODE_ENV

afterEach(() => {
  if (semula === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = semula
  }
})

describe('penyedia email log', () => {
  it('mencatat isi pesan di luar produksi supaya tautannya bisa dipakai', async () => {
    process.env.NODE_ENV = 'development'
    const dicatat: unknown[] = []
    const provider = createLogEmailProvider({ info: (payload) => dicatat.push(payload) })

    await provider.send(PESAN)

    expect(dicatat).toHaveLength(1)
    expect((dicatat[0] as { body?: string }).body).toBe(PESAN.body)
  })

  it('tidak mencatat isi pesan di produksi', async () => {
    process.env.NODE_ENV = 'production'
    const dicatat: unknown[] = []
    const provider = createLogEmailProvider({ info: (payload) => dicatat.push(payload) })

    await provider.send(PESAN)

    expect(dicatat).toHaveLength(1)
    const tercatat = dicatat[0] as { body?: string; bodyLength?: number }
    expect(tercatat.body).toBeUndefined()
    expect(tercatat.bodyLength).toBe(PESAN.body.length)
  })
})
