import { consumeStream, convertToModelMessages, safeValidateUIMessages, streamText, type LanguageModelUsage } from "ai"
import * as z from "zod"
import { ModelId } from "../catalog.js"
import { ConversationId } from "../ids.js"
import { MessageMetadata, type ChatMessage, type Reply } from "../message.js"
import type { Usage } from "../usage.js"
import type { Handler, Reader } from "../wire.js"

export type ChatRequest = {
  readonly id: ConversationId
  readonly model: ModelId
  readonly messages: readonly ChatMessage[]
}

const Envelope = z.object({ id: ConversationId, model: ModelId, messages: z.array(z.unknown()).min(1) })

export const read: Reader<ChatRequest> = async ({ body }) => {
  const envelope = Envelope.safeParse(body)
  if (!envelope.success) return { ok: false, refusal: "body" }
  const messages = await safeValidateUIMessages<ChatMessage>({
    messages: envelope.data.messages,
    metadataSchema: MessageMetadata.optional(),
  })
  if (!messages.success || messages.data.at(-1)?.role !== "user") return { ok: false, refusal: "messages" }
  return { ok: true, value: { id: envelope.data.id, model: envelope.data.model, messages: messages.data } }
}

const failure = "The model failed to answer."

const refuse = (status: number, error: string) => Response.json({ error }, { status })

const usageOf = (usage: LanguageModelUsage): Usage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
  reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
})

const titleOf = (messages: readonly ChatMessage[]) => {
  const first = messages.find((message) => message.role === "user")?.parts.find((part) => part.type === "text")
  return (first?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
}

const keepSavedReplies = (saved: readonly ChatMessage[], sent: readonly ChatMessage[]) => {
  const replies = new Map(
    saved.filter((message) => message.role === "assistant").map((message) => [message.id, message]),
  )
  return sent.map((message) => replies.get(message.id) ?? message)
}

export const handle: Handler<ChatRequest> = async (input, { deps, request }) => {
  const started = deps.clock.now()
  const user = await deps.auth.user(request)
  if (user === undefined) return refuse(401, "sign in to chat")
  const entry = deps.catalog.models.get(input.model)
  if (entry === undefined) return refuse(422, `model ${input.model} is not in the catalog`)
  if (entry.status === "disabled") return refuse(422, `model ${input.model} is disabled`)

  let failed = false
  const result = streamText({
    model: deps.gateway.model(entry),
    messages: await convertToModelMessages([...input.messages]),
    onError: ({ error }) => {
      failed = true
      console.error(error)
    },
  })

  const finish = async (answer: ChatMessage, aborted: boolean) => {
    const usage = failed ? undefined : usageOf(await result.totalUsage)
    const reply: Reply =
      usage === undefined ? { state: "failed", error: failure } : { state: aborted ? "stopped" : "complete", usage }
    const message: ChatMessage = { ...answer, metadata: { model: entry.id, reply } }
    const saved = await deps.store.get(user, input.id)
    const now = deps.clock.now()
    const conversation = {
      id: input.id,
      owner: user,
      title: saved?.conversation.title ?? titleOf(input.messages),
      model: entry.id,
      createdAt: saved?.conversation.createdAt ?? now,
      updatedAt: now,
    }
    await Promise.all([
      deps.store.save(conversation, [...keepSavedReplies(saved?.messages ?? [], input.messages), message]),
      usage === undefined
        ? undefined
        : deps.ledger.record({
            ...usage,
            user,
            conversation: input.id,
            message: message.id,
            model: entry.id,
            at: now,
          }),
    ])
  }

  return result.toUIMessageStreamResponse<ChatMessage>({
    headers: { "Server-Timing": `overhead;dur=${deps.clock.now().getTime() - started.getTime()}` },
    originalMessages: [...input.messages],
    generateMessageId: deps.ids.message,
    messageMetadata: ({ part }) => (part.type === "start" ? { model: entry.id } : undefined),
    onEnd: ({ responseMessage, isAborted }) => finish(responseMessage, isAborted),
    consumeSseStream: ({ stream }) => deps.waitUntil(consumeStream({ stream, onError: console.error })),
  })
}
