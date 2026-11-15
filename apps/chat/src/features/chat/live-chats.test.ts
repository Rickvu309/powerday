import { ConversationId, ModelId, type ChatMessage } from "@powerday/chat-core"
import { createUIMessageStream, type ChatTransport } from "ai"
import { afterEach, expect, it, vi } from "vitest"
import { liveChats } from "./live-chats"

const hold = <Value>(value: Value) => {
  let release = () => {}
  const promise = new Promise<Value>((resolve) => {
    release = () => resolve(value)
  })
  return { promise, release: () => release() }
}

const model = ModelId.parse("mock-fast")
const id = ConversationId.parse("saved")
const saved = {
  conversation: {
    id,
    owner: "person",
    title: "Saved",
    model,
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
  },
  messages: [
    { id: "q", role: "user", parts: [{ type: "text", text: "Stored question" }] },
    { id: "a", role: "assistant", parts: [{ type: "text", text: "Stored answer" }] },
  ],
}

const transportFor = (finish: Promise<void> = Promise.resolve()) =>
  ({
    sendMessages: vi.fn(async () =>
      createUIMessageStream<ChatMessage>({
        execute: async ({ writer }) => {
          writer.write({ type: "start", messageId: "reply" })
          writer.write({ type: "text-start", id: "text" })
          await finish
          writer.write({ type: "text-delta", id: "text", delta: "New answer" })
          writer.write({ type: "text-end", id: "text" })
          writer.write({ type: "finish" })
        },
      }),
    ),
    reconnectToStream: async () => null,
  }) satisfies ChatTransport<ChatMessage>

afterEach(() => vi.unstubAllGlobals())

it("admits one Retry through a reopened conversation while history is pending", async () => {
  const held = hold(Response.json(saved))
  let reads = 0
  vi.stubGlobal("fetch", async () => (++reads === 1 ? Response.json(saved) : held.promise))
  const transport = transportFor()
  const live = liveChats(transport)
  const first = live.open(id)
  await first.load()
  first.retry({ model })
  live.open(null)
  const reopened = live.open(id)
  reopened.retry({ model })
  expect(reopened.read().attempt.kind).toBe("pending")
  expect(reads).toBe(2)
  held.release()
  await vi.waitFor(() => expect(reopened.read().attempt.kind).toBe("idle"))
  expect(transport.sendMessages).toHaveBeenCalledTimes(1)
  expect(reopened.chat.messages.filter((message) => message.role === "user")).toHaveLength(2)
})

it("consumes only the admitted draft and leaves newer and other conversation drafts alone", async () => {
  const finish = hold(undefined)
  const transport = transportFor(finish.promise)
  const live = liveChats(transport)
  const first = live.open(null)
  first.draft.edit("First question")
  const accepted = first.send({ text: first.draft.read(), model })
  expect(accepted).toBe(first.chat.id)
  expect(first.draft.read()).toBe("")
  first.draft.edit("A newer follow-up")
  live.open(null).draft.edit("Another conversation draft")
  expect(first.send({ text: "Blocked send", model })).toBeUndefined()
  expect(first.draft.read()).toBe("A newer follow-up")
  expect(live.open(ConversationId.parse(first.chat.id)).draft.read()).toBe("A newer follow-up")
  finish.release()
  await vi.waitFor(() => expect(first.read().attempt.kind).toBe("idle"))
  expect(first.draft.read()).toBe("A newer follow-up")
  expect(live.open(null).draft.read()).toBe("Another conversation draft")
  expect(transport.sendMessages).toHaveBeenCalledTimes(1)
})

it("does not restore an old history snapshot after a newer Send has finished", async () => {
  const held = hold(Response.json(saved))
  let reads = 0
  vi.stubGlobal("fetch", async () => (++reads === 1 ? Response.json(saved) : held.promise))
  const live = liveChats(transportFor())
  const conversation = live.open(id)
  await conversation.load()
  conversation.stopDisplay()
  const oldRead = conversation.load()
  conversation.send({ text: "New question", model })
  await vi.waitFor(() => expect(conversation.read().attempt.kind).toBe("idle"))
  held.release()
  await oldRead
  expect(
    conversation.chat.messages.some((message) =>
      message.parts.some((part) => part.type === "text" && part.text === "New question"),
    ),
  ).toBe(true)
})

it("keeps a newly admitted local conversation current before its first reply", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  const live = liveChats(transportFor())
  const first = live.open(null)
  const accepted = first.send({ text: "New local question", model })
  expect(accepted).toBeDefined()
  const reopened = live.open(ConversationId.parse(first.chat.id))
  expect(reopened.needsLoad()).toBe(false)
  await reopened.load()
  expect(fetch).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(reopened.read().attempt.kind).toBe("idle"))
})

it("keeps completed output when a history refresh opened during streaming arrives late", async () => {
  const response = hold(Response.json(saved))
  let reads = 0
  vi.stubGlobal("fetch", async () => (++reads === 1 ? Response.json(saved) : response.promise))
  const finish = hold(undefined)
  const conversation = liveChats(transportFor(finish.promise)).open(id)
  await conversation.load()
  conversation.stopDisplay()
  conversation.send({ text: "New question", model })
  await vi.waitFor(() => expect(conversation.chat.status).toBe("streaming"))
  const refresh = conversation.load()
  finish.release()
  await vi.waitFor(() => expect(conversation.read().attempt.kind).toBe("idle"))
  response.release()
  await refresh
  expect(
    conversation.chat.messages.some((message) =>
      message.parts.some((part) => part.type === "text" && part.text === "New answer"),
    ),
  ).toBe(true)
  expect(reads).toBe(1)
})
