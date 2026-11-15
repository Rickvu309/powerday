import { simulateReadableStream, wrapLanguageModel, type LanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, it } from "vitest"
import { createChatApi, type ChatDeps } from "../api.js"
import { parseCatalog } from "../catalog.js"
import { catalogConfig } from "../catalog.fixture.js"
import type { SavedConversation } from "../conversation.js"
import { createModelGateway } from "../gateway.js"
import type { ConversationId, UserId } from "../ids.js"
import type { ChatMessage } from "../message.js"
import { routes } from "../routes.js"
import type { UsageEvent } from "../usage.js"

const catalog = parseCatalog(catalogConfig)
const user = "u1" as UserId
const words = ["Hello ", "there, ", "friend."]
const usage = {
  inputTokens: { total: 7, noCache: 5, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
}

const wordModel = (outcome: "finish" | "error" = "finish") =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 10,
        chunks: [
          { type: "text-start", id: "t" },
          ...words.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          outcome === "finish"
            ? { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }
            : { type: "error", error: new Error("upstream closed the connection") },
        ],
      }),
    }),
  })

const setup = (overrides: Partial<ChatDeps> = {}) => {
  const saved = new Map<string, SavedConversation>()
  const usageEvents: UsageEvent[] = []
  const work: Promise<unknown>[] = []
  let nextId = 0
  const deps: ChatDeps = {
    catalog,
    gateway: { model: () => wordModel() },
    store: {
      list: async () => [],
      get: async (owner, id) => (saved.get(id)?.conversation.owner === owner ? saved.get(id) : undefined),
      save: async (conversation, messages) => void saved.set(conversation.id, { conversation, messages }),
    },
    ledger: {
      record: async (event) => void usageEvents.push(event),
      spent: async () => 0,
      allowance: async () => ({ user, period: "day", tokens: 1000 }),
    },
    auth: { user: async () => user, handle: async () => new Response() },
    clock: { now: () => new Date() },
    ids: { conversation: () => "c-new" as ConversationId, message: () => `a${++nextId}` },
    waitUntil: (promise) => void work.push(promise),
    ...overrides,
  }
  return { app: createChatApi(deps), saved, usageEvents, settle: () => Promise.all(work) }
}

const hello: ChatMessage = { id: "m1", role: "user", parts: [{ type: "text", text: "Say hello" }] }

const send = (app: ReturnType<typeof setup>["app"], messages: ChatMessage[], model = "mock-fast") =>
  app.request(routes.chat.path, { method: "POST", body: JSON.stringify({ id: "c1", model, messages }) })

const events = (sse: string) =>
  sse
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)))

const textOf = (message: ChatMessage | undefined) =>
  message?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

describe("POST /api/chat", () => {
  it("streams the reply token by token as a UI message stream", async () => {
    const { app } = setup()
    const response = await send(app, [hello])
    expect(response.status).toBe(200)
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1")
    const parts = events(await response.text())
    expect(parts.filter((part) => part.type === "text-delta").map((part) => part.delta)).toEqual(words)
    expect(parts[0]).toEqual({ type: "start", messageId: "a1", messageMetadata: { model: "mock-fast" } })
  })

  it("saves the full reply and records its usage once when the client leaves mid-stream", async () => {
    const { app, saved, usageEvents, settle } = setup()
    const reader = (await send(app, [hello])).body!.getReader()
    let seen = ""
    while (!seen.includes("text-delta")) seen += new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    await settle()

    const chat = saved.get("c1")
    expect(chat?.conversation).toMatchObject({ owner: user, title: "Say hello", model: "mock-fast" })
    expect(chat?.messages.map((message) => message.id)).toEqual(["m1", "a1"])
    expect(textOf(chat?.messages[1])).toBe("Hello there, friend.")
    const reply = {
      state: "complete",
      usage: { inputTokens: 7, outputTokens: 3, cachedInputTokens: 2, reasoningTokens: 0 },
    }
    expect(chat?.messages[1]?.metadata).toEqual({ model: "mock-fast", reply })
    expect(usageEvents).toEqual([
      expect.objectContaining({ ...reply.usage, user, conversation: "c1", message: "a1", model: "mock-fast" }),
    ])
  })

  it("keeps the saved full reply when the client sends back the part it saw", async () => {
    const { app, saved, settle } = setup()
    await (await send(app, [hello])).text()
    await settle()
    const partial: ChatMessage = { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello " }] }
    await (await send(app, [hello, partial, { ...hello, id: "m2" }])).text()
    await settle()

    const messages = saved.get("c1")?.messages ?? []
    expect(messages.map((message) => message.id)).toEqual(["m1", "a1", "m2", "a2"])
    expect(textOf(messages[1])).toBe("Hello there, friend.")
  })

  it("saves a failed reply and charges nothing when the provider breaks mid-stream", async () => {
    const { app, saved, usageEvents, settle } = setup({ gateway: { model: () => wordModel("error") } })
    await (await send(app, [hello])).text()
    await settle()

    const reply = saved.get("c1")?.messages[1]
    expect(reply?.metadata?.reply).toEqual({ state: "failed", error: "The model failed to answer." })
    expect(textOf(reply)).toBe("Hello there, friend.")
    expect(usageEvents).toEqual([])
  })

  it("refuses a disabled or unknown model instead of answering with another", async () => {
    const { app } = setup({
      gateway: {
        model: () => {
          throw new Error("a refused request reached the gateway")
        },
      },
    })
    const disabled = await send(app, [hello], "mock-retired")
    expect(disabled.status).toBe(422)
    expect(await disabled.json()).toEqual({ error: "model mock-retired is disabled" })
    const unknown = await send(app, [hello], "mock-nope")
    expect(unknown.status).toBe(422)
    expect(await unknown.json()).toEqual({ error: "model mock-nope is not in the catalog" })
  })

  it("refuses a signed-out visitor", async () => {
    const { app } = setup({ auth: { user: async () => undefined, handle: async () => new Response() } })
    expect((await send(app, [hello])).status).toBe(401)
  })

  it("refuses a request whose last message is not the user's", async () => {
    const { app } = setup()
    const reply: ChatMessage = { id: "a9", role: "assistant", parts: [{ type: "text", text: "Hi" }] }
    const response = await send(app, [hello, reply])
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "messages" })
  })

  it("asks the mock provider to answer within 150 ms of the request", async () => {
    const mock = createModelGateway(catalog, undefined)
    let asked = Number.POSITIVE_INFINITY
    const timed = (model: LanguageModel) => {
      if (typeof model === "string") throw new Error("the mock gateway answered with a model id")
      return wrapLanguageModel({
        model,
        middleware: {
          wrapStream: ({ doStream }) => {
            asked = Math.min(asked, performance.now())
            return doStream()
          },
        },
      })
    }
    const { app, settle } = setup({ gateway: { model: (entry) => timed(mock.model(entry)) } })

    const sent = performance.now()
    const response = await send(app, [hello])
    expect(response.headers.get("Server-Timing")).toMatch(/^overhead;dur=\d+$/)
    await response.text()
    await settle()
    expect(asked - sent).toBeLessThan(150)
  })
})
