import type { EmailMessage } from '../auth/routes.ts'

/**
 * Fase 1 memakai penyedia log. Email belum benar-benar terkirim, jadi setiap
 * pesan ditulis ke log server dan password token apa pun tidak pernah ikut
 * dicatat.
 *
 * Token verifikasi dan undangan memang muncul di isi pesan, karena itu satu-
 * satunya cara mengujinya tanpa layanan email sungguhan. Log ini tidak boleh
 * dipakai di produksi: PRD 15 dan 9 meminta email sungguhan, dan token di log
 * produksi adalah kebocoran kredensial.
 */

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>
}

export function createLogEmailProvider(logger?: { info: (payload: unknown, message?: string) => void }): EmailProvider {
  return {
    async send(message) {
      const payload = { to: message.to, subject: message.subject, bodyLength: message.body.length }
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
