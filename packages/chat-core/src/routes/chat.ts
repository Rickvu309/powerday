import { safeValidateUIMessages } from "ai"
import * as z from "zod"
import { ModelId } from "../catalog.js"
import { ConversationId } from "../ids.js"
import { MessageMetadata, type ChatMessage } from "../message.js"
import { notImplemented, type Handler, type Reader } from "../wire.js"

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
  if (!messages.success) return { ok: false, refusal: "messages" }
  return { ok: true, value: { id: envelope.data.id, model: envelope.data.model, messages: messages.data } }
}

export const handle: Handler<ChatRequest> = () => notImplemented()
