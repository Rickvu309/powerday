import { Chat } from "@ai-sdk/react"
import { ConversationId, MessageMetadata, type ChatMessage } from "@powerday/chat-core"
import { DefaultChatTransport, generateId, type ChatTransport } from "ai"
import { createContext } from "react"
import { readConversation } from "./read-conversation"
import { chatFetch } from "./reply-problem"

export const liveChats = (transport: ChatTransport<ChatMessage>, seed: ChatMessage[] = []) => {
  const create = (id: ConversationId, messages: ChatMessage[] = []) =>
    new Chat<ChatMessage>({ id, transport, messages, messageMetadataSchema: MessageMetadata.optional() })
  const opened = new Map<ConversationId, Chat<ChatMessage>>()
  const loading = new Map<ConversationId, Promise<void>>()
  let draft = create(ConversationId.parse(generateId()), seed)
  const open = (id: ConversationId | null) => {
    if (id === null) return draft
    const chat = opened.get(id) ?? create(id)
    opened.set(id, chat)
    return chat
  }

  return {
    open,
    load: (id: ConversationId) => {
      const chat = open(id)
      if (chat.messages.length > 0) return Promise.resolve()
      const pending =
        loading.get(id) ??
        readConversation(id).then((messages) => {
          chat.messages = messages
        })
      loading.set(id, pending)
      void pending.catch(() => loading.delete(id))
      return pending
    },
    start: () => {
      const started = draft
      const id = ConversationId.parse(started.id)
      opened.set(id, started)
      draft = create(ConversationId.parse(generateId()))
      return id
    },
  }
}

export type LiveChatStore = ReturnType<typeof liveChats>

export const LiveChats = createContext(
  liveChats(
    new DefaultChatTransport<ChatMessage>({
      api: "/api/chat",
      fetch: chatFetch,
      prepareSendMessagesRequest: ({ id, messages, body }) => ({
        body: { id, model: body?.model, message: messages.findLast((message) => message.role === "user") },
      }),
    }),
  ),
)
