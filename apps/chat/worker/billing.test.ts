import { createChatApi, parseCatalog, UserId, ConversationId, type ChatDeps } from "@powerday/chat-core"
import { catalogConfig } from "../../../packages/chat-core/src/catalog.fixture"
import { MockLanguageModelV4 } from "ai/test"
import { expect, it, vi } from "vitest"
import { conversationStore } from "./conversations"
import { conversation, localD1, message } from "./local-d1"
import { usageLedger } from "./usage"

it.each(["billing", "reply"])(
  "recovers from failed %s writes without free replies or permanent lockout",
  async (failure) => {
    const platform = await localD1()
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const db = platform.env.DB
      let now = new Date("2026-11-16T12:00:00Z")
      let next = 0
      const work: Promise<unknown>[] = []
      const model = new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "text" })
              controller.enqueue({ type: "text-delta", id: "text", delta: "Hello" })
              controller.enqueue({ type: "text-end", id: "text" })
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 3, text: 3, reasoning: 0 },
                },
              })
              controller.close()
            },
          }),
        }),
      })
      const deps: ChatDeps = {
        catalog: parseCatalog(catalogConfig),
        gateway: { model: () => model },
        store: conversationStore(platform.env),
        ledger: usageLedger({
          ...platform.env,
          USAGE_LIMITS: { default: { period: "day", tokens: 200 }, overrides: {} },
        }),
        auth: { user: async () => UserId.parse("alice"), handle: async () => new Response() },
        clock: { now: () => now },
        ids: { conversation: () => ConversationId.parse("unused"), message: () => `reply-${++next}` },
        waitUntil: (promise) => {
          work.push(promise.catch(() => undefined))
        },
      }
      const app = createChatApi(deps)
      const send = async (id: string) => {
        const response = await app.request("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            id,
            model: "mock-fast",
            message: { id: `question-${id}`, role: "user", parts: [{ type: "text", text: "Hi" }] },
          }),
        })
        await response.text().catch(() => undefined)
        await Promise.all(work)
        return response.status
      }
      await db
        .prepare(
          failure === "billing"
            ? "CREATE TRIGGER fail_write BEFORE INSERT ON usage_events BEGIN SELECT RAISE(FAIL, 'billing unavailable'); END"
            : "CREATE TRIGGER fail_write BEFORE UPDATE ON messages WHEN json_extract(NEW.body, '$.metadata.reply.state') <> 'streaming' BEGIN SELECT RAISE(FAIL, 'save unavailable'); END",
        )
        .run()
      expect(await send("first")).toBe(200)
      expect(await send("second")).not.toBe(200)
      expect(await deps.ledger.spent(UserId.parse("alice"), new Date("2026-11-16T00:00:00Z"))).toBe(0)
      now = new Date("2026-11-16T12:06:00Z")
      expect(await send("unavailable-recovery")).toBe(500)
      expect(await deps.ledger.spent(UserId.parse("alice"), new Date("2026-11-16T00:00:00Z"))).toBe(0)
      expect(model.doStreamCalls).toHaveLength(1)
      await db.prepare("DROP TRIGGER fail_write").run()
      expect(await send("after-lease")).toBe(429)
      expect(await deps.ledger.spent(UserId.parse("alice"), new Date("2026-11-16T00:00:00Z"))).toBeGreaterThanOrEqual(1)
      expect(await deps.store.delete(UserId.parse("alice"), ConversationId.parse("first"))).toBe(true)
      now = new Date("2026-11-17T00:00:00Z")
      expect(await send("after-reset")).toBe(200)
    } finally {
      log.mockRestore()
      await platform.dispose()
    }
  },
  30_000,
)

it("charges a crashed claim across reset and fences its late completion", async () => {
  const platform = await localD1()
  try {
    const store = conversationStore(platform.env)
    const c = conversation("crashed", "crashed-chat", "Crash", Date.parse("2026-11-16T23:59:00Z"))
    const pending = {
      ...message("crashed-reply", "assistant", ""),
      parts: [],
      metadata: { reply: { state: "streaming" as const } },
    }
    const claimed = await store.claim(c, message("question", "user", "Hello"), pending, {
      since: new Date("2026-11-16T00:00:00Z"),
      tokens: 10,
    })
    expect(claimed).toBeDefined()
    const at = new Date("2026-11-17T00:05:00Z")
    const next = await store.claim(
      { ...c, updatedAt: at },
      message("next", "user", "Again"),
      { ...pending, id: "next-reply" },
      { since: new Date("2026-11-17T00:00:00Z"), tokens: 10 },
    )
    expect(next?.messages.map((m) => m.id)).toEqual(["question", "crashed-reply", "next", "next-reply"])
    const ledger = usageLedger(platform.env)
    expect(await ledger.spent(c.owner, new Date("2026-11-16T00:00:00Z"))).toBe(10)
    expect(await ledger.spent(c.owner, new Date("2026-11-17T00:00:00Z"))).toBe(0)
    const event = {
      user: c.owner,
      conversation: c.id,
      message: pending.id,
      model: c.model,
      at,
      inputTokens: 7,
      outputTokens: 3,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimated: false,
    }
    await store.save(
      { ...c, updatedAt: at },
      [
        message("question", "user", "Hello"),
        {
          ...pending,
          metadata: {
            reply: {
              state: "complete",
              usage: { inputTokens: 7, outputTokens: 3, cachedInputTokens: 0, reasoningTokens: 0 },
            },
          },
        },
      ],
      event,
    )
    expect(await store.get(c.owner, c.id)).toEqual(next)
    expect(await ledger.spent(c.owner, new Date("2026-11-16T00:00:00Z"))).toBe(10)
  } finally {
    await platform.dispose()
  }
}, 30_000)

it("persists a repeated D1 completion without charging twice", async () => {
  const platform = await localD1()
  try {
    const store = conversationStore(platform.env)
    const c = conversation("retry", "retry-chat", "Retry", 1000)
    const pending = {
      ...message("retry-reply", "assistant", ""),
      parts: [],
      metadata: { reply: { state: "streaming" as const } },
    }
    const question = message("question", "user", "Hi")
    await store.claim(c, question, pending, { since: new Date(0), tokens: 10 })
    const event = {
      user: c.owner,
      conversation: c.id,
      message: pending.id,
      model: c.model,
      at: new Date(2000),
      inputTokens: 7,
      outputTokens: 3,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      estimated: false,
    }
    const answer = {
      ...message(pending.id, "assistant", "Hello"),
      metadata: {
        reply: {
          state: "complete" as const,
          usage: { inputTokens: 7, outputTokens: 3, cachedInputTokens: 0, reasoningTokens: 0 },
        },
      },
    }
    await store.save({ ...c, updatedAt: event.at }, [question, answer], event)
    await store.save({ ...c, updatedAt: event.at }, [question, answer], event)
    expect((await store.get(c.owner, c.id))?.messages).toEqual([question, answer])
    expect(await usageLedger(platform.env).spent(c.owner, new Date(0))).toBe(10)
  } finally {
    await platform.dispose()
  }
}, 30_000)
