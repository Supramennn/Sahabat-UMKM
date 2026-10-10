import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'

/**
 * Penyimpanan berkas (PRD 6.2 foto produk, PRD 6.5 lampiran pengeluaran).
 *
 * Antarmukanya sengaja dibuat sempit supaya mengganti penyimpanan lokal dengan
 * S3 kompatibel hanya berarti satu kelas baru, bukan mengubah modul mana pun yang
 * memanggilnya.
 *
 * Konvensi kunci berkas:
 *
 * 1. Kunci selalu diawali workspaceId, jadi berkas dari workspace lain tidak bisa
 *    saling menebak. Kunci dibuat di server, bukan pernah dari isian peramban.
 * 2. Ekstensi diambil dari jenis berkas yang diterima, bukan dari nama berkas yang
 *    dikirim, supaya nama seperti "../../.php" tidak pernah jadi bagian nama.
 * 3. Jalur akhir yang dipakai berada di dalam direktori simpan, dan diperiksa lagi
 *    setelah dinormalkan. Ini menutup jalur keluar direktori.
 */

export interface StoredObject {
  key: string
  bytes: number
  contentType: string
}

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>
  remove(key: string): Promise<void>
}

export interface ImageUpload {
  data: Buffer
  contentType: string
}

export interface AcceptedImage {
  extension: string
  contentType: string
}

/**
 * Hanya tiga jenis ini yang diterima. SVG tidak ada karena isinya bisa berisi
 * skrip, dan PDF bukan gambar barang (PRD 9).
 */
const ACCEPTED_IMAGES: Record<string, AcceptedImage> = {
  'image/jpeg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/png': { extension: 'png', contentType: 'image/png' },
  'image/webp': { extension: 'webp', contentType: 'image/webp' },
}

/** Batas ukuran berkas, PRD 9 meminta batas ukuran berkas ada. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function acceptedImageType(contentType: string): AcceptedImage | null {
  return ACCEPTED_IMAGES[contentType.toLowerCase()] ?? null
}

/** Kunci berkas dibuat dari id workspace dan Purpose, bukan dari nama berkas. */
export function photoKey(workspaceId: number, productId: number, extension: string): string {
  return `${workspaceId}/produk/${productId}.${extension}`
}

export function isProductPhotoKey(key: string, workspaceId: number): boolean {
  return new RegExp(`^${workspaceId}/produk/\\d+\\.(jpg|png|webp)$`).test(key)
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string

  constructor(directory: string) {
    this.root = resolve(directory)
  }

  private pathFor(key: string): string {
    const target = resolve(this.root, normalize(key))

    // Setelah dinormalkan, jalur harus masih di dalam direktori simpan. Ini yang
    // menutup "../" dan nama absolut dari peramban.
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('Kunci berkas berada di luar direktori simpan.')
    }

    return target
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const target = this.pathFor(key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data)
    return { key, bytes: data.byteLength, contentType }
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const target = this.pathFor(key)
    try {
      const data = await readFile(target)
      const extension = target.slice(target.lastIndexOf('.') + 1)
      const accepted = Object.values(ACCEPTED_IMAGES).find((item) => item.extension === extension)
      return { data, contentType: accepted?.contentType ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }

  async remove(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => {
      // Berkas yang sudah hilang bukan kondisi yang perlu dilaporkan.
    })
  }
}

/**
 * Penyimpanan yang tidak dikonfigurasi. Endpoint yang butuh berkas menolak dengan
 * pesan yang jelas, bukan diam-diam menyimpan ke tempat yang tidakebenar.
 */
export class UnconfiguredStorage implements ObjectStorage {
  async put(): Promise<StoredObject> {
    throw new Error('Penyimpanan berkas belum dikonfigurasi.')
  }

  async get(): Promise<{ data: Buffer; contentType: string } | null> {
    throw new Error('Penyimpanan berkas belum dikonfigurasi.')
  }

  async remove(): Promise<void> {
    throw new Error('Penyimpanan berkas belum dikonfigurasi.')
  }
}

/**
 * Direktori simpan lokal. Default-nya folder tersembunyi di root proyek supaya
 * berkas yang terunggah tidak ikut ter-commit tanpa sengaja.
 */
export function localStorageDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.OBJECT_STORAGE_DIR ?? join(process.cwd(), '.object-storage')
}
