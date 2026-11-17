import { ConversationId, MessageMetadata, ModelId, UserId, type ChatMessage } from "@powerday/chat-core"
import { validateUIMessages } from "ai"
import * as z from "zod"
import { rememberConversationTitle } from "../sidebar/conversation-cache"
import { chatFetch } from "./reply-problem"

const SavedConversation = z.object({
  conversation: z.object({
    id: ConversationId,
    owner: UserId,
    title: z.string(),
    model: ModelId,
    createdAt: z.iso.datetime().transform((value) => new Date(value)),
    updatedAt: z.iso.datetime().transform((value) => new Date(value)),
  }),
  messages: z.array(z.unknown()),
})

export const readConversation = async (id: ConversationId) => {
  const response = await chatFetch(`/api/conversations/${encodeURIComponent(id)}`)
  const saved = SavedConversation.parse(await response.json())
  if (saved.conversation.id !== id) throw new Error("Conversation id does not match")
  rememberConversationTitle({ id: saved.conversation.id, title: saved.conversation.title })
  return validateUIMessages<ChatMessage>({ messages: saved.messages, metadataSchema: MessageMetadata.optional() })
}
