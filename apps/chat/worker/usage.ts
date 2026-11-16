import { UsageLimits, type UsageLedger } from "@powerday/chat-core"

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
    allowance: async (user) => ({ user, ...(limits.overrides[user] ?? limits.default) }),
  }
}
