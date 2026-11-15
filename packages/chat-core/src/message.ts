import type { UIMessage } from "ai"
import * as z from "zod"
import { ModelId } from "./catalog.js"
import { Usage } from "./usage.js"

export const Reply = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("streaming") }).readonly(),
  z.strictObject({ state: z.literal("complete"), usage: Usage }).readonly(),
  z.strictObject({ state: z.literal("stopped"), usage: Usage }).readonly(),
  z.strictObject({ state: z.literal("failed"), error: z.string() }).readonly(),
])
export type Reply = z.infer<typeof Reply>

export const MessageMetadata = z.strictObject({ model: ModelId.optional(), reply: Reply.optional() }).readonly()
export type MessageMetadata = z.infer<typeof MessageMetadata>

export type ChatMessage = UIMessage<MessageMetadata>
