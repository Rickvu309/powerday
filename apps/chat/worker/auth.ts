import { Allowlist, createAuth, resend, type Auth, type Sender } from "@powerday/chat-core"

declare global {
  namespace Cloudflare {
    interface Env {
      APP_URL: string
      MAIL_FROM: string
      ALLOWLIST?: unknown
      BETTER_AUTH_SECRET?: string
      RESEND_API_KEY?: string
      GOOGLE_CLIENT_ID?: string
      GOOGLE_CLIENT_SECRET?: string
    }
  }
}

const mailLog =
  (db: D1Database, from: string): Sender =>
  async (mail) => {
    await db
      .prepare("INSERT INTO mail_log (mail) VALUES (?)")
      .bind(JSON.stringify({ from, ...mail }))
      .run()
  }

export const auth = (env: Cloudflare.Env): Auth =>
  createAuth({
    database: env.DB,
    site: env.BETTER_AUTH_SECRET ? { url: env.APP_URL, secret: env.BETTER_AUTH_SECRET } : "loopback",
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    allowlist: Allowlist.parse(env.ALLOWLIST ?? []),
    send: env.RESEND_API_KEY
      ? resend({ key: env.RESEND_API_KEY, from: env.MAIL_FROM })
      : mailLog(env.DB, env.MAIL_FROM),
  })
