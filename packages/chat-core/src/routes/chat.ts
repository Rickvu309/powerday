import { consumeStream, convertToModelMessages, streamText } from "ai"
import * as z from "zod"
import { ModelId } from "../catalog.js"
import { ConversationId } from "../ids.js"
import type { ChatMessage, Reply } from "../message.js"
import type { UsageEvent, UsageLedger } from "../usage.js"
import type { Handler, Reader } from "../wire.js"

const Envelope = z
  .strictObject({
    id: ConversationId,
    model: ModelId,
    message: z.strictObject({
      id: z.string().min(1).max(128),
      role: z.literal("user"),
      parts: z.array(z.strictObject({ type: z.literal("text"), text: z.string().min(1) })).min(1),
    }),
  })
  .readonly()

export type ChatRequest = z.infer<typeof Envelope>

export const read: Reader<ChatRequest> = ({ body }) => {
  const envelope = Envelope.safeParse(body)
  return envelope.success ? { ok: true, value: envelope.data } : { ok: false, refusal: "body" }
}

const failure = "The model failed to answer."
const billingFailure = "The reply could not be billed. Please contact support."

const refuse = (status: number, error: string) => Response.json({ error }, { status })

const textOf = (messages: readonly ChatMessage[]) =>
  messages.flatMap((message) => message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))).join("\n")

const estimate = (text: string) => Math.ceil([...text].length / 4)

const titleOf = (message: ChatMessage) => textOf([message]).replace(/\s+/g, " ").trim().slice(0, 80)

const recordUsage = async (ledger: UsageLedger, event: UsageEvent) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ledger.record(event)
      return
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
}

export const handle: Handler<ChatRequest> = async (input, { deps, request }) => {
  const started = deps.clock.now()
  const user = await deps.auth.user(request)
  if (user === undefined) return refuse(401, "sign in to chat")
  const entry = deps.catalog.models.get(input.model)
  if (entry === undefined) return refuse(422, `model ${input.model} is not in the catalog`)
  if (entry.status === "disabled") return refuse(422, `model ${input.model} is disabled`)

  const prior = await deps.store.get(user, input.id)
  if (
    prior?.messages.some((message) => message.id === input.message.id || message.metadata?.reply?.state === "streaming")
  ) {
    return refuse(409, "message already answered or in progress")
  }
  const model = deps.gateway.model(entry)
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
  )
  if (claimed === undefined) return refuse(409, "message already answered or in progress")
  const messages = claimed.messages.slice(0, -1)

  let failed = false
  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    onError: ({ error }) => {
      failed = true
      console.error(error)
    },
  })

  const finish = async (answer: ChatMessage, aborted: boolean) => {
    const reported = await Promise.resolve(result.totalUsage).catch(() => undefined)
    const usage = {
      inputTokens: reported?.inputTokens ?? estimate(textOf(messages)),
      outputTokens: reported?.outputTokens ?? estimate(textOf([answer])),
      cachedInputTokens: reported?.inputTokenDetails.cacheReadTokens ?? 0,
      reasoningTokens: reported?.outputTokenDetails.reasoningTokens ?? 0,
    }
    const at = deps.clock.now()
    let reply: Reply = failed ? { state: "failed", error: failure } : { state: aborted ? "stopped" : "complete", usage }
    try {
      await recordUsage(deps.ledger, {
        ...usage,
        estimated: reported?.inputTokens === undefined || reported.outputTokens === undefined,
        user,
        conversation: input.id,
        message: pending.id,
        model: entry.id,
        at,
      })
    } catch (error) {
      reply = { state: "failed", error: billingFailure }
      console.error({ event: "chat.billing_failed", user, conversation: input.id, message: pending.id, error })
    }
    await deps.store.save({ ...claimed.conversation, updatedAt: at }, [
      ...messages,
      { ...answer, id: pending.id, metadata: { model: entry.id, reply } },
    ])
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
