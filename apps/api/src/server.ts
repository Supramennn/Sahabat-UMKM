import { buildApp } from './app.ts'

const host = process.env.API_HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.API_PORT ?? '4000', 10)

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET belum diisi. Nilai pengembangan dipakai, jangan pakai di produksi.')
}

const app = await buildApp({ logger: true })

try {
  await app.listen({ host, port })
} catch (error) {
  console.error('API gagal dijalankan:', error instanceof Error ? error.message : error)
  process.exit(1)
}
