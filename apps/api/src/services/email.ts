import type { EmailMessage } from '../auth/routes.ts'

/**
 * Fase 1 memakai penyedia log. Email belum benar-benar terkirim.
 *
 * Di luar produksi, isi pesan ikut ditulis ke log server. Token verifikasi dan
 * undangan hanya ada di isi pesan, dan itu satu-satunya cara memakai tautannya
 * selama belum ada layanan email. Di produksi yang dicatat hanya metadata:
 * token di log produksi adalah kebocoran kredensial (PRD 9), dan PRD 15
 * meminta email sungguhan.
 */

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>
}

export function createLogEmailProvider(logger?: { info: (payload: unknown, message?: string) => void }): EmailProvider {
  return {
    async send(message) {
      const payload = process.env.NODE_ENV === 'production'
        ? { to: message.to, subject: message.subject, bodyLength: message.body.length }
        : { to: message.to, subject: message.subject, body: message.body }
      if (logger) {
        logger.info(payload, 'email dikirim lewat penyedia log')
      } else {
        console.log('[email:log]', JSON.stringify(payload))
      }
    },
  }
}

/**
 * Penyedia yang menahan pesan di memori, dipakai tes. Penting untuk PRD 9:
 * respons reset password tidak boleh membocorkan apakah email terdaftar, dan tes
 * perlu memeriksa isi email tanpa rely pada log.
 */
export function createCapturingEmailProvider(): EmailProvider & { messages: EmailMessage[] } {
  const messages: EmailMessage[] = []
  return {
    messages,
    async send(message) {
      messages.push(message)
    },
  }
}

export function extractToken(body: string): string | null {
  const withLabel = body.match(/: ([A-Za-z0-9_-]{20,})\s*$/)
  return withLabel?.[1] ?? null
}
