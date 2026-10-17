import { deflateRawSync } from 'node:zlib'

/**
 * Penulis ZIP untuk ekspor seluruh data workspace (PRD 6.8).
 *
 * Satu arsip berisi banyak CSV dipilih supaya pengguna menerima semua datanya
 * dalam satu unduhan, dan tiap tabel tetap menjadi berkas CSV yang bisa dibuka
 * spreadsheet mana pun. Format ZIP adalah format yang sudah dipahami semua
 * sistem operasi, jadi tidak ada alat tambahan yang perlu dipasang pengguna.
 *
 * Implementasinya sengaja ditulis sendiri: yang dibutuhkan hanya metode deflate
 * dari zlib bawaan Node dan CRC32, sedangkan menambah pustaka ZIP penuh berarti
 * satu dependensi lagi yang harus dipercaya untuk berkas yang isinya data bisnis.
 */

export interface ZipEntry {
  name: string
  data: Buffer | string
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(data: Buffer): number {
  let value = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    value = CRC_TABLE[(value ^ data[index]!) & 0xff]! ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

/** Waktu MS-DOS dalam format ZIP: tanggal di atas bit 16, waktu di bawah. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  return { time, date: day }
}

export function buildZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now)
  const locals: Buffer[] = []
  const directories: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const compressed = deflateRawSync(raw)
    const checksum = crc32(raw)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    // Bit 11 menandai nama berkas sebagai UTF-8. Nama di sini ASCII, tetapi
    // menandainya membuat perilaku pembaca konsisten.
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    locals.push(local, compressed)

    const directory = Buffer.alloc(46 + name.length)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x0800, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(time, 12)
    directory.writeUInt16LE(date, 14)
    directory.writeUInt32LE(checksum, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(raw.length, 24)
    directory.writeUInt16LE(name.length, 28)
    directory.writeUInt32LE(offset, 42)
    name.copy(directory, 46)
    directories.push(directory)

    offset += local.length + compressed.length
  }

  const central = Buffer.concat(directories)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, central, end])
}
