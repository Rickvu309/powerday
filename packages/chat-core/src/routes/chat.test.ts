import { convertToModelMessages, simulateReadableStream, wrapLanguageModel, type LanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createChatApi, type ChatDeps } from "../api.js"
import { parseCatalog } from "../catalog.js"
import { catalogConfig } from "../catalog.fixture.js"
import type { SavedConversation } from "../conversation.js"
import { createModelGateway } from "../gateway.js"
import { ConversationId, UserId } from "../ids.js"
import type { ChatMessage } from "../message.js"
import { routes } from "../routes.js"
import type { UsageEvent } from "../usage.js"

const catalog = parseCatalog(catalogConfig)
afterEach(() => vi.restoreAllMocks())

const user = UserId.parse("u1")
const words = ["Hello ", "there, ", "friend."]
const usage = {
  inputTokens: { total: 7, noCache: 5, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
}

const wordModel = (outcome: "finish" | "error" | "error-with-usage" = "finish") =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 10,
        chunks: [
          { type: "text-start", id: "t" },
          ...words.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          ...(outcome === "finish"
            ? []
            : [{ type: "error" as const, error: new Error("upstream closed the connection") }]),
          ...(outcome === "error"
            ? []
            : [{ type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage }]),
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
      list: async () => ({ conversations: [] }),
      rename: async () => false,
      delete: async () => false,
      search: async () => [],
      get: async (owner, id) => saved.get(JSON.stringify([owner, id])),
      claim: async (conversation, message, reply, allowance) => {
        if (allowance && (await deps.ledger.spent(conversation.owner, allowance.since)) >= allowance.tokens)
          return undefined
        const key = JSON.stringify([conversation.owner, conversation.id])
        const prior = saved.get(key)
        if (
          prior?.messages.some(
            (m) => m.id === message.id || m.id === reply.id || m.metadata?.reply?.state === "streaming",
          )
        ) {
          return undefined
        }
        const claimed = {
          conversation: {
            ...conversation,
            title: prior?.conversation.title ?? conversation.title,
            createdAt: prior?.conversation.createdAt ?? conversation.createdAt,
          },
          messages: [...(prior?.messages ?? []), message, reply],
        }
        saved.set(key, claimed)
        return claimed
      },
      save: async (conversation, messages, usage) => {
        if (usage) await deps.ledger.record(usage)
        saved.set(JSON.stringify([conversation.owner, conversation.id]), { conversation, messages })
      },
    },
    ledger: {
      record: async (event) => {
        if (
          !usageEvents.some(
            (e) => e.user === event.user && e.conversation === event.conversation && e.message === event.message,
          )
        ) {
          usageEvents.push(event)
        }
      },
      spent: async () => 0,
      allowance: async () => ({ user, period: "day", tokens: 10000 }),
    },
    auth: { user: async () => user, handle: async () => new Response() },
    clock: { now: () => new Date() },
    ids: { conversation: () => ConversationId.parse("c-new"), message: () => `a${++nextId}` },
    waitUntil: (promise) => void work.push(promise),
    ...overrides,
  }
  return { app: createChatApi(deps), deps, saved, usageEvents, settle: () => Promise.all(work) }
}

const hello: ChatMessage = { id: "m1", role: "user", parts: [{ type: "text", text: "Say hello" }] }

const send = (app: ReturnType<typeof setup>["app"], message: ChatMessage, model = "mock-fast") =>
  app.request(routes.chat.path, { method: "POST", body: JSON.stringify({ id: "c1", model, message }) })

const events = (sse: string) =>
  sse
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)))

const textOf = (message: ChatMessage | undefined) =>
  message?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

describe("POST /api/chat", () => {
  it("refuses the 30,000-character CJK input before it can overrun the remaining cap", async () => {
    const { app, deps } = setup()
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 100_000 })
    vi.spyOn(deps.ledger, "spent").mockResolvedValue(85_900)
    const model = vi.spyOn(deps.gateway, "model")
    const claim = vi.spyOn(deps.store, "claim")
    const response = await send(app, { ...hello, parts: [{ type: "text", text: "鿿".repeat(30_000) }] })
    expect(response.status).toBe(429)
    expect(model).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
  })

  it.each(["漢字鿿", "👩🏽‍💻🌍😀", "const answer = (value) => JSON.stringify({ value });"])(
    "reserves at least the UTF-8 byte length and limits output for %s",
    async (text) => {
      const { app, deps, settle } = setup()
      const message = { ...hello, parts: [{ type: "text" as const, text }] }
      const bytes = new TextEncoder().encode(JSON.stringify(await convertToModelMessages([message]))).length
      const model = wordModel()
      vi.spyOn(deps.gateway, "model").mockReturnValue(model)
      vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 1000 })
      const claim = vi.spyOn(deps.store, "claim")
      const response = await send(app, message)
      expect(response.status).toBe(200)
      await response.text()
      await settle()
      const output = model.doStreamCalls[0]?.maxOutputTokens
      expect(output).toBe(1000 - bytes - 8 - 64)
      expect(1000 - (output ?? 1000)).toBeGreaterThanOrEqual(bytes)
      expect(claim.mock.calls[0]?.[3]?.reservation).toBe(1000)
    },
  )

  it("reserves the byte bound plus at most 4096 output tokens but charges provider usage", async () => {
    const { app, deps, usageEvents, settle } = setup()
    const message = { ...hello, parts: [{ type: "text" as const, text: "鿿".repeat(30_000) }] }
    const bytes = new TextEncoder().encode(JSON.stringify(await convertToModelMessages([message]))).length
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 100_000 })
    const claim = vi.spyOn(deps.store, "claim")
    const model = wordModel()
    vi.spyOn(deps.gateway, "model").mockReturnValue(model)
    const response = await send(app, message)
    expect(response.status).toBe(200)
    await response.text()
    await settle()
    expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(4096)
    expect(claim.mock.calls[0]?.[3]?.reservation).toBe(bytes + 8 + 64 + 4096)
    expect(usageEvents[0]).toMatchObject({ inputTokens: 7, outputTokens: 3, estimated: false })
  })

  it("requires room for the minimum reply and distinguishes full from remaining allowance", async () => {
    const { app, deps, settle } = setup()
    const bytes = new TextEncoder().encode(JSON.stringify(await convertToModelMessages([hello]))).length
    const full = bytes + 8 + 64 + 16
    const allowance = vi.spyOn(deps.ledger, "allowance")
    allowance.mockResolvedValue({ user, period: "day", tokens: full - 1 })
    expect((await send(app, hello)).status).toBe(413)
    allowance.mockResolvedValue({ user, period: "day", tokens: full })
    const spent = vi.spyOn(deps.ledger, "spent").mockResolvedValue(1)
    expect((await send(app, hello)).status).toBe(429)
    spent.mockResolvedValue(0)
    const model = wordModel()
    vi.spyOn(deps.gateway, "model").mockReturnValue(model)
    const response = await send(app, hello)
    expect(response.status).toBe(200)
    await response.text()
    await settle()
    expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(16)
  })

  it("returns too long for a fresh allowance without claiming or charging, and accepts a shorter message", async () => {
    const { app, deps, usageEvents, settle } = setup()
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 6000 })
    const model = vi.spyOn(deps.gateway, "model")
    const claim = vi.spyOn(deps.store, "claim")
    const response = await send(app, { ...hello, parts: [{ type: "text", text: "中".repeat(30_000) }] })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "too long" })
    expect(response.headers.get("Retry-After")).toBeNull()
    expect(model).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(usageEvents).toEqual([])
    const shorter = await send(app, hello)
    expect(shorter.status).toBe(200)
    await shorter.text()
    await settle()
  })

  it("blocks at the cap without saving a message or calling the model, then resets", async () => {
    const { app, deps, settle } = setup()
    let now = new Date("2026-11-16T23:59:00Z")
    vi.spyOn(deps.clock, "now").mockImplementation(() => now)
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 200 })
    const spent = vi.spyOn(deps.ledger, "spent").mockResolvedValue(200)
    const model = vi.spyOn(deps.gateway, "model")
    const claim = vi.spyOn(deps.store, "claim")
    const response = await send(app, hello)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "usage limit", resetsAt: "2026-11-17T00:00:00.000Z" })
    expect(response.headers.get("Retry-After")).toBe("60")
    expect(model).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(await deps.store.get(user, ConversationId.parse("c1"))).toBeUndefined()
    expect(spent).toHaveBeenCalledWith(user, new Date("2026-11-16T00:00:00Z"))
    now = new Date("2026-11-17T00:00:00Z")
    spent.mockImplementation(async (_, since) => (since.getTime() >= now.getTime() ? 0 : 200))
    const next = await send(app, hello)
    expect(next.status).toBe(200)
    await next.text()
    await settle()
  })

  it("returns the cap response when another reply records usage before the atomic claim", async () => {
    const { app, deps } = setup()
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "day", tokens: 200 })
    vi.spyOn(deps.ledger, "spent").mockResolvedValueOnce(0).mockResolvedValue(200)
    vi.spyOn(deps.store, "claim").mockResolvedValue(undefined)
    const model = vi.spyOn(deps.gateway, "model")
    const response = await send(app, hello)
    expect(response.status).toBe(429)
    expect(model).not.toHaveBeenCalled()
    expect(deps.store.claim).toHaveBeenCalledWith(expect.anything(), hello, expect.anything(), {
      since: expect.any(Date),
      tokens: 200,
      reservation: 200,
    })
  })

  it("fails closed when usage cannot be read", async () => {
    const { app, deps } = setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(deps.ledger, "spent").mockRejectedValue(new Error("ledger unavailable"))
    const model = vi.spyOn(deps.gateway, "model")
    const claim = vi.spyOn(deps.store, "claim")
    expect((await send(app, hello)).status).toBe(500)
    expect(model).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
  })

  it("finishes a budgeted reply and blocks a follow-up that cannot fit", async () => {
    const { app, deps, usageEvents, settle } = setup()
    vi.spyOn(deps.ledger, "allowance").mockResolvedValue({ user, period: "month", tokens: 200 })
    vi.spyOn(deps.ledger, "spent").mockImplementation(async () =>
      usageEvents.reduce((sum, event) => sum + event.inputTokens + event.outputTokens, 0),
    )
    const first = await send(app, hello)
    expect(first.status).toBe(200)
    await first.text()
    await settle()
    expect(usageEvents).toHaveLength(1)
    expect(usageEvents[0]).toMatchObject({ inputTokens: 7, outputTokens: 3 })
    expect((await send(app, { ...hello, id: "m2" })).status).toBe(413)
    expect(usageEvents).toHaveLength(1)
  })

  it("retains the claim when atomic completion retries are exhausted", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { app, deps, usageEvents, settle } = setup()
    const save = vi.spyOn(deps.store, "save").mockRejectedValue(new Error("completion unavailable"))
    await (await send(app, hello)).text()
    await settle()
    expect(usageEvents).toEqual([])
    expect((await deps.store.get(user, ConversationId.parse("c1")))?.messages.at(-1)?.metadata?.reply).toEqual({
      state: "streaming",
    })
    expect((await send(app, { ...hello, id: "m2" })).status).toBe(409)
    expect(save).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "chat.completion_failed", message: "a1" }))
  })

  it("retries atomic completion and does not double-charge an ambiguous write", async () => {
    const { app, deps, usageEvents, settle } = setup()
    const save = deps.store.save
    let attempts = 0
    vi.spyOn(deps.store, "save").mockImplementation(async (...args) => {
      attempts++
      await save(...args)
      if (attempts === 1) throw new Error("write committed but acknowledgement lost")
    })
    await (await send(app, hello)).text()
    await settle()
    expect(attempts).toBe(2)
    expect(usageEvents).toHaveLength(1)
    expect((await deps.store.get(user, ConversationId.parse("c1")))?.messages.at(-1)?.metadata?.reply?.state).toBe(
      "complete",
    )
  })

  it("charges the full reservation when an upstream error leaves usage unreported", async () => {
    const { app, deps, usageEvents, settle } = setup({ gateway: { model: () => wordModel("error") } })
    await (await send(app, hello)).text()
    await settle()
    const sent = JSON.stringify(await convertToModelMessages([hello]))
    expect(usageEvents).toEqual([
      expect.objectContaining({
        message: "a1",
        inputTokens: new TextEncoder().encode(sent).length + 8 + 64,
        outputTokens: 4096,
        estimated: true,
      }),
    ])
    expect((await deps.store.get(user, ConversationId.parse("c1")))?.messages.at(-1)?.metadata?.reply?.state).toBe(
      "failed",
    )
    expect((await send(app, hello)).status).toBe(409)
    await settle()
    expect(usageEvents).toHaveLength(1)
  })

  it("charges unreported CJK input at least its UTF-8 bytes and never past the allowance", async () => {
    const { app, usageEvents, settle } = setup({ gateway: { model: () => wordModel("error") } })
    const cjk: ChatMessage = { id: "m1", role: "user", parts: [{ type: "text", text: "鿿".repeat(2000) }] }
    await (await send(app, cjk)).text()
    await settle()
    const [event] = usageEvents
    expect(event?.inputTokens).toBeGreaterThanOrEqual(6000)
    expect((event?.inputTokens ?? 0) + (event?.outputTokens ?? 0)).toBeLessThanOrEqual(10000)
    expect(event?.estimated).toBe(true)
  })

  it("uses provider-reported usage when a failed stream still reports it", async () => {
    const { app, deps, usageEvents, settle } = setup({ gateway: { model: () => wordModel("error-with-usage") } })
    await (await send(app, hello)).text()
    await settle()
    expect(usageEvents).toEqual([
      expect.objectContaining({
        message: "a1",
        inputTokens: 7,
        outputTokens: 3,
        cachedInputTokens: 2,
        reasoningTokens: 0,
        estimated: false,
      }),
    ])
    expect((await deps.store.get(user, ConversationId.parse("c1")))?.messages.at(-1)?.metadata?.reply?.state).toBe(
      "failed",
    )
  })

  it("keeps Alice and Bob's c1 messages isolated through follow-up turns", async () => {
    let owner = UserId.parse("alice")
    const { app, deps, settle } = setup({ auth: { user: async () => owner, handle: async () => new Response() } })
    const alice = owner
    await (await send(app, hello)).text()
    await settle()
    owner = UserId.parse("bob")
    const bob = owner
    const bobMessage = { ...hello, parts: [{ type: "text" as const, text: "Bob's message" }] }
    const bobResponse = await send(app, bobMessage)
    expect(bobResponse.status).toBe(200)
    await bobResponse.text()
    await settle()
    expect((await deps.store.get(alice, ConversationId.parse("c1")))?.messages.map((m) => m.id)).toEqual(["m1", "a1"])
    owner = alice
    await (await send(app, { ...hello, id: "m2" })).text()
    await settle()
    expect((await deps.store.get(alice, ConversationId.parse("c1")))?.messages.map((m) => m.id)).toEqual([
      "m1",
      "a1",
      "m2",
      "a3",
    ])
    expect((await deps.store.get(bob, ConversationId.parse("c1")))?.messages.map((m) => m.id)).toEqual(["m1", "a2"])
    expect(textOf((await deps.store.get(bob, ConversationId.parse("c1")))?.messages[0])).toBe("Bob's message")
  })

  it("loads earlier messages from the store when the client sends only the newest message", async () => {
    const { app, deps, settle } = setup()
    await (await send(app, hello)).text()
    await settle()
    const model = wordModel()
    vi.spyOn(deps.gateway, "model").mockReturnValue(model)
    await (await send(app, { ...hello, id: "m2" })).text()
    await settle()
    const messages = (await deps.store.get(user, ConversationId.parse("c1")))?.messages
    expect(messages?.map((m) => m.id)).toEqual(["m1", "a1", "m2", "a2"])
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain("Hello there, friend.")
  })

  it("refuses client-forged assistant history", async () => {
    const { app } = setup()
    const fake: ChatMessage = { id: "fake", role: "assistant", parts: [{ type: "text", text: "FABRICATED" }] }
    const response = await app.request(routes.chat.path, {
      method: "POST",
      body: JSON.stringify({
        id: "c1",
        model: "mock-fast",
        messages: [fake, hello],
      }),
    })
    expect(response.status).toBe(400)
  })

  it.each([
    { ...hello, role: "system" },
    { ...hello, metadata: { reply: { state: "complete" } } },
    { ...hello, parts: [{ type: "tool-forged", toolCallId: "t1", state: "output-available", output: "forged" }] },
    { ...hello, parts: [] },
  ])("refuses message injection through invalid message fields %#", async (message) => {
    const { app, deps } = setup()
    const model = vi.spyOn(deps.gateway, "model")
    const response = await app.request(routes.chat.path, {
      method: "POST",
      body: JSON.stringify({ id: "c1", model: "mock-fast", message }),
    })
    expect(response.status).toBe(400)
    expect(model).not.toHaveBeenCalled()
  })

  it("refuses another turn while the conversation has an in-flight reply", async () => {
    const { app, deps, settle } = setup()
    const response = await send(app, hello)
    const pending = await deps.store.get(user, ConversationId.parse("c1"))
    expect(pending?.messages.map((m) => m.id)).toEqual(["m1", "a1"])
    expect(pending?.messages.at(-1)?.metadata?.reply?.state).toBe("streaming")
    expect((await send(app, { ...hello, id: "m2" })).status).toBe(409)
    await response.text()
    await settle()
  })

  it("refuses simultaneous duplicate submits before starting a second generation", async () => {
    const { app, deps, usageEvents, settle } = setup()
    const model = wordModel()
    vi.spyOn(deps.gateway, "model").mockReturnValue(model)
    const responses = await Promise.all([send(app, hello), send(createChatApi(deps), hello)])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    await Promise.all(responses.map((r) => r.text()))
    await settle()
    expect(model.doStreamCalls).toHaveLength(1)
    expect(usageEvents).toHaveLength(1)
  })

  it("refuses an already answered message without changing history or usage", async () => {
    const { app, deps, usageEvents, settle } = setup()
    await (await send(app, hello)).text()
    await settle()
    const before = await deps.store.get(user, ConversationId.parse("c1"))
    expect((await send(app, hello)).status).toBe(409)
    await settle()
    expect(await deps.store.get(user, ConversationId.parse("c1"))).toEqual(before)
    expect(usageEvents).toHaveLength(1)
  })

  it("streams the reply token by token as a UI message stream", async () => {
    const { app } = setup()
    const response = await send(app, hello)
    expect(response.status).toBe(200)
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1")
    const parts = events(await response.text())
    expect(parts.filter((part) => part.type === "text-delta").map((part) => part.delta)).toEqual(words)
    expect(parts[0]).toEqual({ type: "start", messageId: "a1", messageMetadata: { model: "mock-fast" } })
  })

  it("saves the full reply and records its usage once when the client leaves mid-stream", async () => {
    const { app, saved, usageEvents, settle } = setup()
    const reader = (await send(app, hello)).body!.getReader()
    let seen = ""
    while (!seen.includes("text-delta")) seen += new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    await settle()

    const chat = saved.get(JSON.stringify([user, "c1"]))
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

  it("refuses a disabled or unknown model instead of answering with another", async () => {
    const { app } = setup({
      gateway: {
        model: () => {
          throw new Error("a refused request reached the gateway")
        },
      },
    })
    const disabled = await send(app, hello, "mock-retired")
    expect(disabled.status).toBe(422)
    expect(await disabled.json()).toEqual({ error: "model mock-retired is disabled" })
    const unknown = await send(app, hello, "mock-nope")
    expect(unknown.status).toBe(422)
    expect(await unknown.json()).toEqual({ error: "model mock-nope is not in the catalog" })
  })

  it("refuses a signed-out visitor", async () => {
    const { app } = setup({ auth: { user: async () => undefined, handle: async () => new Response() } })
    expect((await send(app, hello)).status).toBe(401)
  })

  it("refuses a message with an assistant role", async () => {
    const { app } = setup()
    const reply: ChatMessage = { id: "a9", role: "assistant", parts: [{ type: "text", text: "Hi" }] }
    const response = await send(app, reply)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "body" })
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
    const response = await send(app, hello)
    expect(response.headers.get("Server-Timing")).toMatch(/^overhead;dur=\d+$/)
    await response.text()
    await settle()
    expect(asked - sent).toBeLessThan(150)
  })
})
