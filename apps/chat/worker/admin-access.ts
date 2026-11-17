import { type AdminAccess } from "@powerday/chat-core"
import * as z from "zod"

export const adminAccess = (db: D1Database, secret: string | undefined, assets?: Fetcher): AdminAccess => {
  const parsed = z
    .array(z.email().toLowerCase())
    .max(100)
    .safeParse(
      (() => {
        try {
          return JSON.parse(secret ?? "null")
        } catch {
          return undefined
        }
      })(),
    )
  const emails = new Set(parsed.success ? parsed.data : [])
  return {
    page: assets === undefined ? undefined : (request) => assets.fetch(request),
    email: async (user) => {
      if (emails.size === 0) return undefined
      const email = await db.prepare('SELECT email FROM "user" WHERE id = ?').bind(user).first<string>("email")
      return email !== null && emails.has(email.toLowerCase()) ? email.toLowerCase() : undefined
    },
  }
}
