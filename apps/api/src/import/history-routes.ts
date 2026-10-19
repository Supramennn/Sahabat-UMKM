import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sahabat/db'
import { writeAudit } from '../auth/audit.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import { StockError } from '../stock/movements.ts'
import { requireImportGate } from './gate.ts'
import { cancelImportJob, listImportJobs } from './jobs.ts'
import { templateCsv, templateKinds, templateXlsx, type TemplateKind } from './templates.ts'

/**
 * Riwayat impor, pembatalan, dan template (PRD 6.8).
 *
 * Ketiganya dikumpulkan di satu tempat karena semuanya menjawab pertanyaan yang sama:
 * "berkas apa yang sudah masuk, bisakah dibatalkan, dan bentuk berkas yang benar
 * seperti apa". Halaman pengaturan impor dan ekspor menampilkan riwayat ini.
 */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const templateQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
})

export function registerImportHistoryRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/imports', async (request, reply) => {
    const context = await requireImportGate(db, request)
    const query = listQuerySchema.parse(request.query ?? {})

    return reply
      .code(200)
      .send(await listImportJobs(db, context.workspaceId, query.limit, query.offset))
  })

  /**
   * Template per jenis impor, dalam CSV atau XLSX. Isinya dibuat dari spesifikasi
   * yang sama dengan yang diuji terhadap validator, jadi tidak bisa berbeda dengan
   * kolom yang benar-benar diterima.
   */
  app.get('/api/workspaces/:workspaceId/imports/templates/:kind', async (request, reply) => {
    await requireImportGate(db, request)
    const kind = templateKindFrom(paramsOf(request).kind)
    const query = templateQuerySchema.parse(request.query ?? {})

    if (query.format === 'xlsx') {
      const buffer = await templateXlsx(kind)
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="template-impor-${kind}.xlsx"`)
        .send(buffer)
    }

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="template-impor-${kind}.csv"`)
      .send(templateCsv(kind))
  })

  /**
   * B-04: pembatalan hanya boleh selama belum ada transaksi turunan. Aturan
   * per jenisnya ada di jobs.ts, dan pemeriksaan di sana diulang di dalam transaksi
   * yang sama dengan penghapusan atau pembalikannya.
   */
  app.post('/api/workspaces/:workspaceId/imports/:jobId/cancel', async (request, reply) => {
    const context = await requireImportGate(db, request)
    const jobId = idFrom(paramsOf(request).jobId)

    const hasil = await db.transaction((tx) => cancelImportJob(tx, context, jobId))

    if (!hasil.replayed) {
      await writeAudit(db, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        actorRole: context.role,
        action: 'import.cancel',
        objectType: 'import',
        objectId: String(jobId),
        metadata: { cancelled: hasil.cancelled },
      })
    }

    return reply.code(200).send(hasil)
  })
}

function templateKindFrom(raw: unknown): TemplateKind {
  const value = String(raw)
  if ((templateKinds as readonly string[]).includes(value)) {
    return value as TemplateKind
  }
  throw new StockError('data_tidak_valid', 'Jenis template tidak dikenal.', 400)
}
