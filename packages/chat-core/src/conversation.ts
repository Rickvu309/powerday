import * as z from "zod"
import { ModelId } from "./catalog.js"
import { ConversationId, UserId } from "./ids.js"
import type { UsageEvent } from "./usage.js"
import type { ChatMessage } from "./message.js"

export const Conversation = z
  .strictObject({
    id: ConversationId,
    owner: UserId,
    title: z.string(),
    model: ModelId,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .readonly()
export type Conversation = z.infer<typeof Conversation>

export type SavedConversation = {
  readonly conversation: Conversation
  readonly messages: readonly ChatMessage[]
}

export const Cursor = z
  .string()
  .regex(/^\d{1,15}\.[A-Za-z0-9_-]{1,64}$/)
  .transform((text) => {
    const dot = text.indexOf(".")
    return { updatedAt: new Date(Number(text.slice(0, dot))), id: ConversationId.parse(text.slice(dot + 1)) }
  })
export type Cursor = z.output<typeof Cursor>

export const cursorAfter = (conversation: Conversation): string =>
  `${conversation.updatedAt.getTime()}.${conversation.id}`

export const ConversationPage = z.strictObject({
  conversations: z.array(Conversation).readonly(),
  next: z.string().optional(),
})
export type ConversationPage = z.infer<typeof ConversationPage>

export const Found = z.strictObject({ conversation: Conversation, snippet: z.string() }).readonly()
export type Found = z.infer<typeof Found>

export const Title = z.string().trim().min(1).max(200)

export const pageSize = 50

export const titleOf = (messages: readonly ChatMessage[]): string => {
  const first = messages.find((message) => message.role === "user")
  const text = (first?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 100 ? `${text.slice(0, 99).trimEnd()}…` : text || "New chat"
}

export type ConversationStore = {
  readonly list: (owner: UserId, before: Cursor | undefined) => Promise<ConversationPage>
  readonly get: (owner: UserId, id: ConversationId) => Promise<SavedConversation | undefined>
  readonly claim: (
    conversation: Conversation,
    message: ChatMessage,
    reply: ChatMessage,
    allowance?: { readonly since: Date; readonly tokens: number },
  ) => Promise<SavedConversation | undefined>
  readonly save: (conversation: Conversation, messages: readonly ChatMessage[], usage?: UsageEvent) => Promise<void>
  readonly rename: (owner: UserId, id: ConversationId, title: string) => Promise<boolean>
  readonly delete: (owner: UserId, id: ConversationId) => Promise<boolean>
  readonly search: (owner: UserId, query: string) => Promise<readonly Found[]>
}
