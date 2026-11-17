import { consumeStream, convertToModelMessages, streamText } from "ai"
import * as z from "zod"
import { ModelId } from "../catalog.js"
import { ConversationId } from "../ids.js"
import type { ChatMessage, Reply } from "../message.js"
import { periodOf, type UsageEvent } from "../usage.js"
import type { Handler, Reader } from "../wire.js"

const maxMessageCharacters = 100_000
const maxReplyTokens = 4096
const minimumReplyTokens = 16
const chatTemplateTokensPerMessage = 8
const chatTemplateTokensPerRequest = 64

const Envelope = z
  .strictObject({
    id: ConversationId,
    model: ModelId,
    message: z.strictObject({
      id: z.string().min(1).max(128),
      role: z.literal("user"),
      parts: z
        .array(z.strictObject({ type: z.literal("text"), text: z.string().min(1).max(maxMessageCharacters) }))
        .min(1)
        .max(1000),
    }),
  })
  .readonly()

export type ChatRequest = z.infer<typeof Envelope>

export const read: Reader<ChatRequest> = ({ body }) => {
  const envelope = Envelope.safeParse(body)
  return envelope.success && textOf([envelope.data.message]).length <= maxMessageCharacters
    ? { ok: true, value: envelope.data }
    : { ok: false, refusal: "body" }
}

const failure = "The model failed to answer."

const refuse = (status: number, error: string) => Response.json({ error }, { status })

const textOf = (messages: readonly ChatMessage[]) =>
  messages.flatMap((message) => message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))).join("\n")

const titleOf = (message: ChatMessage) => textOf([message]).replace(/\s+/g, " ").trim().slice(0, 80)

export const handle: Handler<ChatRequest> = async (input, { deps, request }) => {
  const started = deps.clock.now()
  const user = await deps.auth.user(request)
  if (user === undefined) return refuse(401, "sign in to chat")
  const entry = deps.catalog.models.get(input.model)
  if (entry === undefined) return refuse(422, `model ${input.model} is not in the catalog`)
  if (entry.status === "disabled") return refuse(422, `model ${input.model} is disabled`)

  const prior = await deps.store.get(user, input.id)
  if (prior?.messages.some((message) => message.id === input.message.id)) {
    return refuse(409, "message already answered or in progress")
  }
  const allowance = await deps.ledger.allowance(user)
  const since = periodOf(allowance.period, started).start
  const modelMessages = await convertToModelMessages([...(prior?.messages ?? []), input.message])
  const serializedMessages = JSON.stringify(modelMessages)
  const inputBound =
    new TextEncoder().encode(serializedMessages).length +
    modelMessages.length * chatTemplateTokensPerMessage +
    chatTemplateTokensPerRequest
  if (inputBound + minimumReplyTokens > allowance.tokens) return refuse(413, "too long")
  const limitResponse = () => {
    const resetsAt = periodOf(allowance.period, started).end
    return Response.json(
      { error: "usage limit", resetsAt: resetsAt.toISOString() },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((resetsAt.getTime() - started.getTime()) / 1000)) },
      },
    )
  }
  const spent = await deps.ledger.spent(user, since)
  const remaining = allowance.tokens - spent
  if (remaining < inputBound + minimumReplyTokens) return limitResponse()
  const maxOutputTokens = Math.min(remaining - inputBound, maxReplyTokens)
  const reservation = inputBound + maxOutputTokens
  const now = deps.clock.now()
  const pending: ChatMessage = {
    id: deps.ids.message(),
    role: "assistant",
    parts: [],
    metadata: { model: entry.id, reply: { state: "streaming" } },
  }
  const claimed = await deps.store.claim(
    {
      id: input.id,
      owner: user,
      title: prior?.conversation.title ?? titleOf(input.message),
      model: entry.id,
      createdAt: prior?.conversation.createdAt ?? now,
      updatedAt: now,
    },
    input.message,
    pending,
    { since, tokens: allowance.tokens, reservation },
  )
  if (claimed === undefined) {
    const currentSpent = await deps.ledger.spent(user, since)
    return allowance.tokens - currentSpent < reservation
      ? limitResponse()
      : refuse(409, "message already answered or in progress")
  }
  const model = deps.gateway.model(entry)
  const messages = claimed.messages.slice(0, -1)

  let failed = false
  const result = streamText({
    model,
    timeout: { totalMs: 120_000 },
    messages: modelMessages,
    maxOutputTokens,
    onError: ({ error }) => {
      failed = true
      console.error(error)
    },
  })

  const finish = async (answer: ChatMessage, aborted: boolean) => {
    const reported = await Promise.resolve(result.totalUsage).catch(() => undefined)
    const usage = {
      inputTokens: reported?.inputTokens ?? inputBound,
      outputTokens: reported?.outputTokens ?? maxOutputTokens,
      cachedInputTokens: reported?.inputTokenDetails.cacheReadTokens ?? 0,
      reasoningTokens: reported?.outputTokenDetails.reasoningTokens ?? 0,
    }
    const at = deps.clock.now()
    const reply: Reply = failed
      ? { state: "failed", error: failure }
      : { state: aborted ? "stopped" : "complete", usage }
    const event: UsageEvent = {
      ...usage,
      estimated: reported?.inputTokens === undefined || reported.outputTokens === undefined,
      user,
      conversation: input.id,
      message: pending.id,
      model: entry.id,
      at,
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await deps.store.save(
          { ...claimed.conversation, updatedAt: at },
          [...messages, { ...answer, id: pending.id, metadata: { model: entry.id, reply } }],
          event,
        )
        return
      } catch (error) {
        if (attempt === 2)
          console.error({ event: "chat.completion_failed", user, conversation: input.id, message: pending.id, error })
      }
    }
  }

  return result.toUIMessageStreamResponse<ChatMessage>({
    headers: { "Server-Timing": `overhead;dur=${deps.clock.now().getTime() - started.getTime()}` },
    originalMessages: messages,
    generateMessageId: () => pending.id,
    messageMetadata: ({ part }) => (part.type === "start" ? { model: entry.id } : undefined),
    onEnd: ({ responseMessage, isAborted }) => finish(responseMessage, isAborted),
    consumeSseStream: ({ stream }) => deps.waitUntil(consumeStream({ stream, onError: console.error })),
  })
}
