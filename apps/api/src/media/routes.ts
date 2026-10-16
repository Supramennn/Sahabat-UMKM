import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { AuthorizationError, loadWorkspaceRole, requireSession } from '../auth/session.ts'
import { writeAudit } from '../auth/audit.ts'
import { can } from '@sahabat/shared'
import {
  acceptedImageType,
  isExpenseAttachmentKey,
  isProductPhotoKey,
  LocalObjectStorage,
  localStorageDirectory,
  MAX_IMAGE_BYTES,
  photoKey,
  UnconfiguredStorage,
  type ObjectStorage,
} from '../storage/index.ts'
import { z } from 'zod'

/**
 * Foto produk (PRD 6.2 "foto opsional").
 *
 * Berkas dikirim sebagai data URL supaya tidak perlu pustaka pengolah gambar dan
 * tidak perlu menyimpan berkas sementara. Ukuran yang diterima dibatasi sebelum
 * decoding, dan jenis gambarnya diperiksa lewat magic bytes, bukan lewat header
 * yang dikirim peramban (PRD 9).
 */

const uploadSchema = z.object({
  contentType: z.string().min(1).max(120),
  data: z.string().min(1).max(Math.ceil(MAX_IMAGE_BYTES * 1.4)),
})

/**
 * Magic bytes tiga jenis gambar yang diterima. Header Content-Type berasal dari
 * peramban dan bisa apa saja, jadi jenis berkas ditentukan dari isinya.
 */
function sniffImage(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

function decodeDataUrl(input: string): Buffer {
  const [, payload = ''] = input.split(',', 2)
  return Buffer.from(payload, 'base64')
}

export function registerMediaRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps
  const storage: ObjectStorage =
    process.env.OBJECT_STORAGE_DIR === undefined
      ? new UnconfiguredStorage()
      : new LocalObjectStorage(localStorageDirectory())

  app.post('/api/workspaces/:workspaceId/products/:productId/photo', async (request, reply) => {
    const session = requireSession(request)
    const params = (request.params ?? {}) as Record<string, string>
    const workspaceId = Number(params.workspaceId)
    const productId = Number(params.productId)

    const { workspaceId: id, role } = await loadWorkspaceRole(db, request, workspaceId)
    if (!can(role, 'products.manage')) {
      throw new AuthorizationError('Hanya Owner dan Admin yang bisa mengubah foto barang.')
    }

    const input = uploadSchema.parse(request.body)

    const declared = acceptedImageType(input.contentType)
    if (!declared) {
      return reply.code(400).send({
        error: 'jenis_berkas_tidak_didukung',
        message: 'Foto harus berupa JPEG, PNG, atau WebP.',
      })
    }

    const data = decodeDataUrl(input.data)

    if (data.byteLength > MAX_IMAGE_BYTES) {
      return reply.code(413).send({
        error: 'berkas_terlalu_besar',
        message: `Ukuran foto maksimal ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB. Foto yang lebih besar diperkecil dulu di ponsel.`,
      })
    }

    const sniffed = sniffImage(data)
    if (!sniffed || sniffed !== declared.contentType) {
      return reply.code(400).send({
        error: 'isi_berkas_tidak_cocok',
        message: 'Isi berkas tidak cocok dengan jenis gambarnya.',
      })
    }

    const produk = await db.query<{ id: number; photo_key: string | null }>(
      'select id, photo_key from products where id = $1 and workspace_id = $2',
      [productId, id],
    )
    const row = produk.rows[0]
    if (!row) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Produk tidak ditemukan.' })
    }

    const key = photoKey(id, productId, declared.extension)
    await storage.put(key, data, declared.contentType)

    if (row.photo_key && row.photo_key !== key) {
      await storage.remove(row.photo_key)
    }

    await db.query('update products set photo_key = $1 where id = $2 and workspace_id = $3', [
      key,
      productId,
      id,
    ])

    await writeAudit(db, {
      workspaceId: id,
      actorUserId: session.userId,
      actorRole: role,
      action: 'product.photo_updated',
      objectType: 'product',
      objectId: String(productId),
    })

    return reply.code(200).send({ photoKey: key, bytes: data.byteLength })
  })

  /**
   * Berkas dilayani API, bukan lewat direktori statis, karena setiap pembacaan
   * harus memeriksa keanggotaan workspace. Kunci yang tidak cocok dengan pola
   * workspace diperiksa sebelum dibaca, jadi satu pengguna tidak bisa menebak nama
   * berkas milik workspace lain.
   */
  app.get('/api/workspaces/:workspaceId/media/:key', async (request, reply) => {
    const params = (request.params ?? {}) as Record<string, string>
    const workspaceId = Number(params.workspaceId)
    const key = params.key ?? ''

    const { workspaceId: id, role } = await loadWorkspaceRole(db, request, workspaceId)

    if (!isProductPhotoKey(key, id) && !isExpenseAttachmentKey(key, id)) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Berkas tidak ditemukan.' })
    }

    if (isExpenseAttachmentKey(key, id)) {
      if (!can(role, 'reports.expenses')) {
        throw new AuthorizationError('Anda tidak punya izin untuk melihat lampiran pengeluaran.')
      }
      const attachment = await db.query(
        'select 1 from expense_attachments where workspace_id = $1 and object_key = $2',
        [id, key],
      )
      if (attachment.rows.length === 0) {
        return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Berkas tidak ditemukan.' })
      }
    }

    const objek = await storage.get(key)
    if (!objek) {
      return reply.code(404).send({ error: 'tidak_ditemukan', message: 'Berkas tidak ditemukan.' })
    }

    // Gambar dari storage lokal tidak boleh dipakai untuk memuat skrip, dan
    // unduhan otomatis tidak diinginkan untuk foto barang. Lampiran PDF diberi
    // disposition attachment supaya berkas tidak pernah dirender di dalam origins
    // API yang sama.
    const lampiranPdf = key.endsWith('.pdf')

    return reply
      .code(200)
      .header('Content-Type', objek.contentType)
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'")
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', lampiranPdf ? 'attachment' : 'inline')
      .send(objek.data)
  })
}
