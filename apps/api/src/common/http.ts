import type { FastifyRequest } from 'fastify'

/**
 * Pembantu kecil untuk membaca parameter kueri yang berupa penanda.
 *
 * `request.params` hanya berisi bagian rute, jadi membaca `archived` dari sana
 * selalu menghasilkan undefined dan filter tidak pernah berlaku diam-diam.
 * Parameter kueri dibaca dari `request.query`.
 */
export function queryFlag(request: FastifyRequest, name: string): boolean {
  const query = (request.query ?? {}) as Record<string, unknown>
  return query[name] === 'true' || query[name] === true
}