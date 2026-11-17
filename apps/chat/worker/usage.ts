import { UsageLimits, type UsageLedger } from "@powerday/chat-core"

export const seedUsageLimits = async (db: D1Database, seed: unknown) => {
  const limits = UsageLimits.parse(seed)
  const rows = [
    { user: "", ...limits.default },
    ...Object.entries(limits.overrides).map(([user, limit]) => ({ user, ...limit })),
  ]
  await db
    .prepare(`INSERT OR IGNORE INTO admin_limits (email, tokens, period)
    SELECT coalesce((SELECT lower(email) FROM "user" WHERE id = json_extract(value, '$.user')), json_extract(value, '$.user')),
      json_extract(value, '$.tokens'), json_extract(value, '$.period')
    FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM admin_limits)`)
    .bind(JSON.stringify(rows))
    .run()
}

export const usageLedger = ({ DB: db, USAGE_LIMITS }: Cloudflare.Env): UsageLedger => {
  const limits = UsageLimits.parse(USAGE_LIMITS)
  return {
    record: async (event) => {
      await db
        .prepare(
          `INSERT INTO usage_events (message, user, conversation, model, input_tokens, output_tokens,
          cached_input_tokens, reasoning_tokens, at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (message) DO NOTHING`,
        )
        .bind(
          event.message,
          event.user,
          event.conversation,
          event.model,
          event.inputTokens,
          event.outputTokens,
          event.cachedInputTokens,
          event.reasoningTokens,
          event.at.getTime(),
        )
        .run()
    },
    spent: async (user, since) =>
      (await db
        .prepare(
          "SELECT coalesce(sum(input_tokens + output_tokens), 0) AS spent FROM usage_events WHERE user = ?1 AND at >= ?2",
        )
        .bind(user, since.getTime())
        .first<number>("spent")) ?? 0,
    allowance: async (user) => {
      await seedUsageLimits(db, limits)
      const row = await db
        .prepare(`SELECT tokens, period FROM admin_limits
        WHERE email = lower((SELECT email FROM "user" WHERE id = ?1)) OR email = ?1 OR email = ''
        ORDER BY CASE WHEN email = '' THEN 1 ELSE 0 END LIMIT 1`)
        .bind(user)
        .first()
      const limit = UsageLimits.parse({ default: row ?? { period: "day", tokens: 0 }, overrides: {} }).default
      return { user, ...limit }
    },
  }
}
