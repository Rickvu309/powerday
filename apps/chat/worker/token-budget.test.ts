import { createChatApi, parseCatalog, UserId, ConversationId } from "@powerday/chat-core"
import { catalogConfig } from "../../../packages/chat-core/src/catalog.fixture"
import { MockLanguageModelV4 } from "ai/test"
import { expect, it } from "vitest"
import { conversationStore } from "./conversations"
import { conversation, localD1, message } from "./local-d1"
import { usageLedger } from "./usage"

it.each([
  { tokens: 1, text: "x".repeat(100_000), status: 429 },
  { tokens: 20, text: "x".repeat(60), status: 429 },
  { tokens: 100, text: "Hi", status: 200 },
  { tokens: 100_000, text: "Hi", status: 200 },
  { tokens: 100_000, text: "x".repeat(1_000_001), status: 400 },
])(
  "bounds model spend for $tokens tokens and status $status",
  async ({ tokens, text, status }) => {
    const platform = await localD1()
    try {
      const jobs: Promise<unknown>[] = []
      const model = new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 0, text: 0, reasoning: 0 },
                },
              })
              controller.close()
            },
          }),
        }),
      })
      const user = UserId.parse("budget")
      const store = conversationStore(platform.env)
      const ledger = usageLedger({
        ...platform.env,
        USAGE_LIMITS: { default: { period: "day", tokens }, overrides: {} },
      })
      const app = createChatApi({
        catalog: parseCatalog(catalogConfig),
        gateway: { model: () => model },
        store,
        ledger,
        auth: { user: async () => user, handle: async () => new Response() },
        clock: { now: () => new Date("2026-11-16T12:00:00Z") },
        ids: { message: () => "answer", conversation: () => ConversationId.parse("unused") },
        waitUntil: (job) => {
          jobs.push(job)
        },
      })
      await store.save(conversation(user, "budget", "Budget", 1000), [message("history", "user", "Earlier prompt")])
      const response = await app.request("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          id: "budget",
          model: "mock-fast",
          message: message("question", "user", text),
        }),
      })
      await response.text()
      await Promise.all(jobs)
      expect(response.status).toBe(status)
      if (status !== 200) {
        expect(model.doStreamCalls).toHaveLength(0)
        expect(await ledger.spent(user, new Date(0))).toBe(0)
        if (status === 429) expect(response.headers.get("Retry-After")).toBe("43200")
        return
      }
      const call = model.doStreamCalls[0]!
      const inputTokens = Math.ceil(JSON.stringify(call.prompt).length / 3)
      expect(call.maxOutputTokens).toBe(Math.min(tokens - inputTokens, 4096))
      expect(call.maxOutputTokens).toBeGreaterThan(0)
      const reservation = await platform.env.DB.prepare(
        "SELECT reserved_tokens FROM messages WHERE id = 'answer'",
      ).first<number>("reserved_tokens")
      expect(reservation).toBe(inputTokens + call.maxOutputTokens!)
    } finally {
      await platform.dispose()
    }
  },
  30_000,
)
