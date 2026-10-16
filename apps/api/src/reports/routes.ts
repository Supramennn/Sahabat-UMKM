import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Workbook } from 'exceljs'
import type { Database } from '@sahabat/db'
import { can, type Capability } from '@sahabat/shared'
import { AuthorizationError, loadWorkspaceRole } from '../auth/session.ts'
import { assertFeature } from '../plans/service.ts'
import { idFrom, paramsOf } from '../purchasing/routes.ts'
import { StockError } from '../stock/movements.ts'
import { createReport, reportKinds, type ReportFilter, type ReportKind } from './service.ts'

const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Tanggal tidak valid.')

const filtersSchema = z.object({
  from: dateFilter.optional(),
  to: dateFilter.optional(),
  locationId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
}).refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
  message: 'Tanggal awal harus sama dengan atau sebelum tanggal akhir.',
  path: ['to'],
})

const reportCapability: Record<ReportKind, Capability> = {
  stock: 'reports.stock', movements: 'reports.stock', stocktake: 'reports.stock',
  purchases: 'reports.purchasing', debts: 'reports.debt', sales: 'reports.sales',
  'gross-profit': 'reports.gross_profit', expenses: 'reports.expenses', monthly: 'reports.gross_profit',
}

function kindFrom(value: string): ReportKind {
  if ((reportKinds as readonly string[]).includes(value)) return value as ReportKind
  throw new StockError('laporan_tidak_ditemukan', 'Jenis laporan tidak ditemukan.', 404)
}

async function authorize(db: Database, request: FastifyRequest, kind: ReportKind, exportData: boolean) {
  const workspaceId = idFrom(paramsOf(request).workspaceId)
  const context = await loadWorkspaceRole(db, request, workspaceId)
  const purchasingExportOnly = context.role === 'purchasing' && kind !== 'purchases'
  if (!can(context.role, reportCapability[kind]) || (exportData && (!can(context.role, 'data.export') || purchasingExportOnly))) {
    throw new AuthorizationError('Anda tidak punya izin untuk melihat atau mengekspor laporan ini.')
  }
  return context
}

export function registerReportRoutes(app: FastifyInstance, deps: { db: Database }): void {
  const { db } = deps

  app.get('/api/workspaces/:workspaceId/reports/:kind', async (request, reply) => {
    const params = paramsOf(request)
    const kind = kindFrom(params.kind ?? '')
    const context = await authorize(db, request, kind, false)
    const filter = filtersSchema.parse(request.query ?? {}) as ReportFilter
    if (kind === 'debts') await db.transaction(async (tx) => { await tx.query('select id from workspaces where id = $1 for update', [context.workspaceId]); await assertFeature(tx, context.workspaceId, 'returns') })
    const report = await createReport(db, context.workspaceId, kind, filter)
    return reply.code(200).send({ ...report, filters: filter })
  })

  app.get('/api/workspaces/:workspaceId/reports/:kind/export', async (request, reply) => {
    const params = paramsOf(request)
    const kind = kindFrom(params.kind ?? '')
    const context = await authorize(db, request, kind, true)
    const query = request.query as Record<string, unknown>
    const { format, ...rawFilters } = query
    const parsed = filtersSchema.parse(rawFilters) as ReportFilter
    if (format !== 'csv' && format !== 'xlsx') throw new StockError('format_tidak_didukung', 'Format ekspor harus CSV atau XLSX.', 400)
    if (format === 'xlsx') await db.transaction(async (tx) => { await tx.query('select id from workspaces where id = $1 for update', [context.workspaceId]); await assertFeature(tx, context.workspaceId, 'xlsxExport') })
    if (kind === 'debts') await db.transaction(async (tx) => { await tx.query('select id from workspaces where id = $1 for update', [context.workspaceId]); await assertFeature(tx, context.workspaceId, 'returns') })
    const report = await createReport(db, context.workspaceId, kind, parsed)
    const suffix = [parsed.from, parsed.to].filter(Boolean).join('-') || 'semua-periode'
    const filename = `laporan-${kind}-${suffix}`

    if (format === 'csv') {
      const csvCell = (value: unknown) => {
        if (value === null || value === undefined) return ''
        const text = String(value)
        const safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text
        return `"${safe.replaceAll('"', '""')}"`
      }
      const lines = [report.columns.map((column) => csvCell(column.label)).join(','), ...report.rows.map((row) => report.columns.map((column) => csvCell(row[column.key])).join(','))]
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}.csv"`)
        .send(`\uFEFF${lines.join('\r\n')}`)
    }

    const workbook = new Workbook()
    const sheet = workbook.addWorksheet(report.title.slice(0, 31))
    sheet.addRow(report.columns.map((column) => column.label))
    for (const row of report.rows) sheet.addRow(report.columns.map((column) => row[column.key] ?? null))
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.columns.forEach((column) => { column.width = Math.min(36, Math.max(14, String(column.header ?? '').length + 3)) })
    const bytes = await workbook.xlsx.writeBuffer()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      .send(Buffer.from(bytes))
  })
}
