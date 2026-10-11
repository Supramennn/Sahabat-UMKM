import type { Database } from '@sahabat/db'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { registerMfaRoutes } from './auth/mfa-routes.ts'
import { registerAuthRoutes, type AuthDeps } from './auth/routes.ts'
import { AuthenticationError, AuthorizationError, registerSessionLoader } from './auth/session.ts'
import { registerStockRoutes } from './stock/routes.ts'
import { registerImportRoutes } from './import/routes.ts'
import { registerMediaRoutes } from './media/routes.ts'
import { registerPurchasingRoutes } from './purchasing/routes.ts'
import { registerPurchaseOrderShareRoutes } from './purchasing/share.ts'
import { registerSalesRoutes } from './sales/routes.ts'
import { StockError } from './stock/movements.ts'
import { createLogEmailProvider, type EmailProvider } from './services/email.ts'

export interface BuildOptions {
  logger?: boolean
  origin?: string
  sessionSecret?: string
  db?: Database
  email?: EmailProvider
  /** True saat dijalankan di belakang HTTPS. Cookie Secure tidak bisa diuji di localhost. */
  secureCookies?: boolean
  /** Kunci enkripsi rahasia MFA. Nilai pengembangan dipakai kalau tidak diisi. */
  encryptionSecret?: string
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  })

  const origin = options.origin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production'

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

  // PRD 9: CORS terbatas. Plugin ini tidak hanya memeriksa asal, ia juga
  // menuliskan Access-Control-Allow-Origin pada respons. Pemeriksaan asal saja
  // tidak cukup, karena peramban menolak membaca respons yang tidak memakai header
  // itu, dan cookie sesi hanya boleh dibaca bila Allow-Credentials ikut dikirim.
  await app.register(cors, {
    // Hanya satu asal, bukan pola. Origins yang tidak terdaftar tidak mendapat
    // header allow-origin sama sekali, sehingga peramban memblokir responsnya.
    origin: [origin],
    // Wajib true karena sesi memakai cookie HttpOnly. Tanpa header ini, cookie
    // tidak ikut pada permintaan lintas asal dan pengguna selalu terb logout.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })

  await app.register(cookie, {
    secret: options.sessionSecret ?? process.env.SESSION_SECRET ?? 'rahasia-pengembangan',
    hook: 'onRequest',
  })

  // PRD 9: pembatasan percobaan. Batas kasar di sini, lalu batas per akun dan per
  // alamat IP yang lebih ketat ditangani di lapisan login.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  })

  if (options.db) {
    registerSessionLoader(app, options.db, secureCookies)

    const email = options.email ?? createLogEmailProvider(app.log)
    const deps: AuthDeps = {
      db: options.db,
      secureCookies,
      sendEmail: email.send.bind(email),
      // PRD 9: enkripsi saat disimpan dan tanpa secret di repositori, jadi kunci
      // MFA hanya datang dari environment.
      encryptionSecret:
        options.encryptionSecret ?? process.env.MFA_ENCRYPTION_SECRET ?? 'rahasia-mfa-pengembangan',
      // Tautan verifikasi dan atur ulang kata sandi menuju ke halaman web,
      // bukan ke endpoint API.
      webOrigin: origin,
    }
    registerAuthRoutes(app, deps)
    registerMfaRoutes(app, deps)
    registerStockRoutes(app, { db: options.db })
    registerImportRoutes(app, { db: options.db })
    registerMediaRoutes(app, { db: options.db })
    registerPurchasingRoutes(app, { db: options.db })
    registerPurchaseOrderShareRoutes(app, { db: options.db, webOrigin: origin, sendEmail: deps.sendEmail })
    registerSalesRoutes(app, { db: options.db })
  }

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

    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message })
    }

    // Galat stok sudah berbentuk pesan yang bisa ditampilkan: nama produk,
    // lokasi, dan saldo yang tersedia (PRD 6.2).
    if (error instanceof StockError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
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

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const candidate = (error as { statusCode?: unknown }).statusCode
    if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) {
      return candidate
    }
  }
  return 500
}
