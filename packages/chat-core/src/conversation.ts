import type { ModelId } from "./catalog.js"
import type { ConversationId, UserId } from "./ids.js"
import type { ChatMessage } from "./message.js"

export type Conversation = {
  readonly id: ConversationId
  readonly owner: UserId
  readonly title: string
  readonly model: ModelId
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type SavedConversation = {
  readonly conversation: Conversation
  readonly messages: readonly ChatMessage[]
}

export type ConversationStore = {
  readonly list: (owner: UserId) => Promise<readonly Conversation[]>
  readonly get: (owner: UserId, id: ConversationId) => Promise<SavedConversation | undefined>
  readonly save: (conversation: Conversation, messages: readonly ChatMessage[]) => Promise<void>
}
