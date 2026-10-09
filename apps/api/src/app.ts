import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export interface BuildOptions {
  logger?: boolean
  origin?: string
  sessionSecret?: string
}

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const candidate = (error as { statusCode?: unknown }).statusCode
    if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) {
      return candidate
    }
  }
  return 500
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  })

  const origin = options.origin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000'

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", origin],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })

  // PRD 9: CORS terbatas. Tanpa daftar asal yang eksplisit, tidak ada asal lain
  // yang boleh membaca respons. Hook dipasang pada instance akar, bukan di dalam
  // register, karena Fastify mengunci hook tiap plugin di lingkupnya sendiri, jadi
  // route yang didaftarkan di luar tidak akan melihat hook tersebut.
  app.addHook('onRequest', async (request, reply) => {
    const requestOrigin = request.headers.origin
    if (requestOrigin && requestOrigin !== origin) {
      return reply.code(403).send({ error: 'asal_tidak_diizinkan' })
    }
  })

  await app.register(cookie, {
    secret: options.sessionSecret ?? process.env.SESSION_SECRET ?? 'rahasia-pengembangan',
    hook: 'onRequest',
  })

  // PRD 9: pembatasan percobaan masuk per akun dan per alamat IP.
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'halaman_tidak_ditemukan' })
  })

  // PRD 9: pesan galat tidak boleh menampilkan stack trace atau informasi
  // internal. Detailnya tetap masuk ke log server, tidak pernah ke respons.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'data_tidak_valid',
        fields: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const status = statusOf(error)
    request.log.error({ err: error }, 'permintaan gagal')

    reply.code(status).send({
      error: status === 500 ? 'terjadi_kesalahan' : 'permintaan_tidak_valid',
    })
  })

  return app
}
