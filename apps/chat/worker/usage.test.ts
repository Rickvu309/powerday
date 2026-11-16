import { ConversationId, ModelId, UserId } from "@powerday/chat-core"
import { expect, it } from "vitest"
import { localD1 } from "./local-d1"
import { usageLedger } from "./usage"

it("persists usage once, isolates users and applies configured allowances", async () => {
  const platform = await localD1()
  try {
    const user = UserId.parse("alice")
    const bob = UserId.parse("bob")
    const ledger = usageLedger({
      ...platform.env,
      USAGE_LIMITS: {
        default: { period: "day", tokens: 10 },
        overrides: { alice: { period: "month", tokens: 20 } },
      },
    })
    const at = new Date("2026-11-16T12:00:00Z")
    const event = {
      user,
      conversation: ConversationId.parse("c1"),
      message: "a1",
      model: ModelId.parse("mock"),
      inputTokens: 7,
      outputTokens: 3,
      cachedInputTokens: 2,
      reasoningTokens: 1,
      estimated: false,
      at,
    }
    await ledger.record({ ...event, message: "old", at: new Date("2026-10-31T23:59:59Z") })
    await ledger.record(event)
    await usageLedger(platform.env).record(event)
    await ledger.record({ ...event, user: bob, message: "bob" })
    expect(await ledger.spent(user, new Date("2026-11-01T00:00:00Z"))).toBe(10)
    expect(await ledger.spent(bob, at)).toBe(10)
    expect(await ledger.spent(user, new Date("2026-11-17T00:00:00Z"))).toBe(0)
    expect(await ledger.allowance(user)).toEqual({ user, period: "month", tokens: 20 })
    expect(await ledger.allowance(bob)).toEqual({ user: bob, period: "day", tokens: 10 })
    expect(() => usageLedger({ ...platform.env, USAGE_LIMITS: undefined })).toThrow()
    expect(() => usageLedger({ ...platform.env, USAGE_LIMITS: { default: { period: "day", tokens: -1 } } })).toThrow()
  } finally {
    await platform.dispose()
  }
}, 30_000)
