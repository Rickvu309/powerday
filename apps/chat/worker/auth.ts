import { Allowlist, createAuth, resend, type Auth, type Sender } from "@powerday/chat-core"

declare global {
  namespace Cloudflare {
    interface Env {
      LOCAL_AUTH?: string
      APP_URL: string
      MAIL_FROM: string
      ALLOWLIST?: unknown
      ALLOWLIST_JSON?: string
      EMAIL?: SendEmail | undefined
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

export const cloudflareEmail =
  (binding: SendEmail, from: string): Sender =>
  async (mail) => {
    await binding.send({ from, ...mail })
  }

export const auth = (env: Cloudflare.Env): Auth => {
  const local = env.LOCAL_AUTH === "true" && !env.BETTER_AUTH_SECRET
  const send = env.RESEND_API_KEY
    ? resend({ key: env.RESEND_API_KEY, from: env.MAIL_FROM })
    : local
      ? mailLog(env.DB, env.MAIL_FROM)
      : env.EMAIL
        ? cloudflareEmail(env.EMAIL, env.MAIL_FROM)
        : undefined
  if (!send || (!local && (!env.BETTER_AUTH_SECRET || !env.MAIL_FROM || !env.ALLOWLIST_JSON)))
    return {
      user: async () => undefined,
      handle: async () =>
        Response.json(
          { error: "Sign-in unavailable: configure the auth and allowlist secrets and email delivery." },
          { status: 503, headers: { "cache-control": "no-store" } },
        ),
    }
  return createAuth({
    database: env.DB,
    ipAddressHeader: "cf-connecting-ip",
    site: env.BETTER_AUTH_SECRET ? { url: env.APP_URL, secret: env.BETTER_AUTH_SECRET } : "loopback",
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    allowlist: Allowlist.parse(
      env.ALLOWLIST_JSON === undefined ? (env.ALLOWLIST ?? []) : JSON.parse(env.ALLOWLIST_JSON),
    ),
    send,
  })
}
