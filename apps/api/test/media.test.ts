import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { closeTestDatabase, createTestDatabase } from '@sahabat/db/test-harness'
import { buildApp } from '../src/app.ts'
import { createCapturingEmailProvider, type EmailProvider } from '../src/services/email.ts'
import { cookieOf } from './account-helpers.ts'
import { hashPassword } from '../src/auth/password.ts'
import {
  acceptedImageType,
  isProductPhotoKey,
  LocalObjectStorage,
  MAX_IMAGE_BYTES,
  photoKey,
} from '../src/storage/index.ts'

/**
 * PRD 6.2 foto opsional untuk produk, PRD 9 batas ukuran berkas dan output
 * encoding. Berkas disimpan di luar database dan hanya dilayani lewat API, karena
 * setiap pembacaan harus memeriksa keanggotaan workspace.
 */

const PASSWORD = 'kata-sandi-pengujian-2026'
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let storageDir = ''
let db: Database
let app: FastifyInstance
let email: EmailProvider

beforeAll(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'sahabat-media-'))
  process.env.OBJECT_STORAGE_DIR = storageDir

  db = await createTestDatabase()
  email = createCapturingEmailProvider()
  app = await buildApp({ db, email, sessionSecret: 'rahasia-uji', origin: 'http://localhost:3000' })
  await app.ready()
})

afterAll(async () => {
  delete process.env.OBJECT_STORAGE_DIR
  await app.close()
  await closeTestDatabase(db)
  await rm(storageDir, { recursive: true, force: true })
})

let sequence = 0
let passwordHash = ''

async function setupWorkspace(): Promise<{ cookie: string; workspaceId: number }> {
  sequence += 1
  passwordHash ||= await hashPassword(PASSWORD)
  const address = `media-${sequence}@contoh.test`

  const user = await db.query<{ id: number }>(
    `insert into users (email, password_hash, name, email_verified_at)
     values ($1, $2, 'Pemilik Media', now())
     returning id`,
    [address, passwordHash],
  )

  const workspace = await db.query<{ id: number }>(
    'insert into workspaces (slug, name, owner_id) values ($1, $2, $3) returning id',
    [`media-${sequence}`, `Toko Media ${sequence}`, user.rows[0]!.id],
  )
  const workspaceId = workspace.rows[0]!.id

  await db.query('insert into workspace_settings (workspace_id) values ($1)', [workspaceId])
  await db.query('insert into memberships (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    user.rows[0]!.id,
    'owner',
  ])

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: address, password: PASSWORD },
  })

  return { cookie: cookieOf(login), workspaceId }
}

async function buatProduk(context: { cookie: string; workspaceId: number }): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${context.workspaceId}/products`,
    headers: { cookie: context.cookie },
    payload: { sku: `FOTO-${sequence}`, name: 'Barang berfoto', unitCode: 'pcs' },
  })
  return response.json().productId as number
}

function dataUrl(contentType: string, base64: string): string {
  return `data:${contentType};base64,${base64}`
}

describe('menentukan jenis gambar', () => {
  it('menerima hanya JPEG, PNG, dan WebP', () => {
    expect(acceptedImageType('image/png')?.extension).toBe('png')
    expect(acceptedImageType('IMAGE/JPEG')?.extension).toBe('jpg')
    expect(acceptedImageType('image/webp')?.extension).toBe('webp')
    expect(acceptedImageType('image/svg+xml')).toBeNull()
    expect(acceptedImageType('text/html')).toBeNull()
  })

  it('menolak SVG karena isinya bisa berisi skrip', () => {
    expect(acceptedImageType('image/svg+xml')).toBeNull()
  })
})

describe('kunci berkas (PRD 9)', () => {
  it('menyertakan workspace dan id produk, bukan nama berkas dari peramban', () => {
    expect(photoKey(7, 42, 'png')).toBe('7/produk/42.png')
    expect(isProductPhotoKey('7/produk/42.png', 7)).toBe(true)
  })

  it('menolak kunci milik workspace lain atau bentuk yang tidak dikenal', () => {
    expect(isProductPhotoKey('8/produk/42.png', 7)).toBe(false)
    expect(isProductPhotoKey('7/produk/42.sh', 7)).toBe(false)
    expect(isProductPhotoKey('../rahasia.txt', 7)).toBe(false)
  })

  it('menolak jalur yang keluar dari direktori simpan', async () => {
    const storage = new LocalObjectStorage(join(storageDir, 'dalam'))
    await expect(storage.put('../keluar.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      /di luar direktori simpan/,
    )
  })
})

describe('unggah foto produk (PRD 6.2)', () => {
  it('menyimpan foto dan mencatat kuncinya di produk', async () => {
    const context = await setupWorkspace()
    const productId = await buatProduk(context)

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}/photo`,
      headers: { cookie: context.cookie },
      payload: { contentType: 'image/png', data: dataUrl('image/png', PNG_1X1) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().photoKey).toBe(`${context.workspaceId}/produk/${productId}.png`)

    const produk = await db.query<{ photo_key: string }>(
      'select photo_key from products where id = $1',
      [productId],
    )
    expect(produk.rows[0]!.photo_key).toBe(`${context.workspaceId}/produk/${productId}.png`)
  })

  it('melayani berkas hanya kepada anggota workspace yang cocok', async () => {
    const context = await setupWorkspace()
    const productId = await buatProduk(context)
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}/photo`,
      headers: { cookie: context.cookie },
      payload: { contentType: 'image/png', data: dataUrl('image/png', PNG_1X1) },
    })

    const anggota = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/media/${context.workspaceId}%2Fproduk%2F${productId}.png`,
      headers: { cookie: context.cookie },
    })

    expect(anggota.statusCode).toBe(200)
    expect(anggota.headers['content-type']).toBe('image/png')
    expect(anggota.headers['x-content-type-options']).toBe('nosniff')
    expect(anggota.headers['content-security-policy']).toContain("default-src 'none'")

    const Asing = await setupWorkspace()
    const response = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${context.workspaceId}/media/${context.workspaceId}%2Fproduk%2F${productId}.png`,
      headers: { cookie: Asing.cookie },
    })
    expect(response.statusCode).toBe(403)
  })

  it('menolak berkas yang isinya bukan gambar meski headernya benar', async () => {
    const context = await setupWorkspace()
    const productId = await buatProduk(context)
    const script = Buffer.from('<script>alert(1)</script>', 'utf8').toString('base64')

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}/photo`,
      headers: { cookie: context.cookie },
      payload: { contentType: 'image/png', data: dataUrl('image/png', script) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('isi_berkas_tidak_cocok')
  })

  it('menolak jenis berkas di luar tiga gambar yang diterima', async () => {
    const context = await setupWorkspace()
    const productId = await buatProduk(context)

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}/photo`,
      headers: { cookie: context.cookie },
      payload: { contentType: 'application/pdf', data: dataUrl('application/pdf', PNG_1X1) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('jenis_berkas_tidak_didukung')
  })

  it('menolak berkas yang lebih besar dari batas ukuran', async () => {
    const context = await setupWorkspace()
    const productId = await buatProduk(context)

    const besar = 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES * 1.4) + 16)
    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${context.workspaceId}/products/${productId}/photo`,
      headers: { cookie: context.cookie },
      payload: { contentType: 'image/png', data: besar },
    })

    // Skema menolak sebelum dekripsi, jadi badan yang sangat besar tidak pernah
    // diubah menjadi buffer di memori.
    expect(response.statusCode).toBe(413)
  })

  it('menolak unggah dari workspace lain', async () => {
    const pemilik = await setupWorkspace()
    const pencoba = await setupWorkspace()
    const productId = await buatProduk(pemilik)

    const response = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${pencoba.workspaceId}/products/${productId}/photo`,
      headers: { cookie: pencoba.cookie },
      payload: { contentType: 'image/png', data: dataUrl('image/png', PNG_1X1) },
    })

    expect(response.statusCode).toBe(404)
  })
})
