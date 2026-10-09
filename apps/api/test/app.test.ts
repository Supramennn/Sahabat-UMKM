import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { buildApp } from '../src/app.ts'

const parsedEmail = z.object({ email: z.string().email() })

async function appWithRoutes(
  register: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  // Route harus didaftarkan sebelum ready(), karena Fastify menutup cetak biru
  // route begitu instance siap menerima permintaan.
  const app = await buildApp({ origin: 'http://localhost:3000', sessionSecret: 'rahasia-uji' })
  register(app)
  await app.ready()
  return app
}

describe('endpoint kesehatan', () => {
  it('menjawab tanpa error', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})

describe('keputusan lapisan (PRD 9)', () => {
  it('mengirim Content Security Policy yang melarang skrip pihak ketiga', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({ method: 'GET', url: '/health' })
    const csp = response.headers['content-security-policy']

    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    await app.close()
  })

  it('tidak mengirim header CORS untuk asal yang tidak terdaftar', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://penyerang.example' },
    })

    // Peramban tidak akan membaca respons ini. Yang menentukan adalah header
    // yang tidak ada, bukan kode status.
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    await app.close()
  })

  it('mengizinkan asal yang terdaftar dan mengizinkan kredensial', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    })

    // Tanpa kedua header ini, peramban tidak bisa membaca respons dan cookie
    // sesi tidak ikut terbaca, sehingga seluruh halaman tidak bisa berfungsi.
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
    await app.close()
  })

  it('menjawab permintaan prapengecekan tanpa asal terdaftar', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
      },
    })

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(response.headers['access-control-allow-methods']).toContain('POST')
    await app.close()
  })

  it('menjawab permintaan tanpa asal seperti biasa', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    await app.close()
  })
})

describe('galat tidak membocorkan informasi internal (PRD 9)', () => {
  it('rute yang tidak ada menjawab 404 tanpa detail tambahan', async () => {
    const app = await appWithRoutes(() => {})
    const response = await app.inject({ method: 'GET', url: '/tidak-ada' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'halaman_tidak_ditemukan' })
    await app.close()
  })

  it('tidak pernah mengirim stack trace pada galat server', async () => {
    const app = await appWithRoutes((instance) => {
      instance.get('/uji-gagal', async () => {
        throw new Error('rahasia internal tidak boleh muncul')
      })
    })

    const response = await app.inject({ method: 'GET', url: '/uji-gagal' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'terjadi_kesalahan' })
    expect(response.body).not.toContain('rahasia internal')
    expect(response.body).not.toContain('at ')
    await app.close()
  })

  it('validasi yang gagal menyebut field bermasalah, bukan isi permintaan', async () => {
    const app = await appWithRoutes((instance) => {
      instance.post('/uji-validasi', async () => {
        parsedEmail.parse({ email: 'bukan-email' })
        return { ok: true }
      })
    })

    const response = await app.inject({
      method: 'POST',
      url: '/uji-validasi',
      payload: { email: 'bukan-email' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBe('data_tidak_valid')
    expect(body.fields[0].path).toBe('email')
    await app.close()
  })
})

describe('pembatasan laju (PRD 9)', () => {
  it('membalas 429 setelah batas terlampaui', async () => {
    const app = await appWithRoutes(() => {})
    let sawLimit = false

    for (let attempt = 0; attempt < 400; attempt += 1) {
      const response = await app.inject({ method: 'GET', url: '/health' })
      if (response.statusCode === 429) {
        sawLimit = true
        break
      }
    }

    expect(sawLimit).toBe(true)
    await app.close()
  })
})
