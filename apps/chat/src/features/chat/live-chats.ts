import { Chat } from "@ai-sdk/react"
import { ConversationId, MessageMetadata, type ChatMessage } from "@powerday/chat-core"
import { DefaultChatTransport, generateId, type ChatTransport } from "ai"
import { createContext } from "react"
import { readConversation } from "./read-conversation"
import { chatFetch, ReplyProblem } from "./reply-problem"

export const liveChats = (transport: ChatTransport<ChatMessage>, seed: ChatMessage[] = []) => {
  const create = (id: ConversationId, messages: ChatMessage[] = []) =>
    new Chat<ChatMessage>({ id, transport, messages, messageMetadataSchema: MessageMetadata.optional() })
  const opened = new Map<ConversationId, Chat<ChatMessage>>()
  const loading = new Map<ConversationId, Promise<void>>()
  const stale = new Set<ConversationId>()
  let draft = create(ConversationId.parse(generateId()), seed)
  const open = (id: ConversationId | null) => {
    if (id === null) return draft
    const chat = opened.get(id) ?? create(id)
    opened.set(id, chat)
    return chat
  }

  return {
    open,
    needsLoad: (id: ConversationId) => open(id).messages.length === 0 || stale.has(id),
    refreshOnOpen: (id: ConversationId) => void stale.add(id),
    load: (id: ConversationId) => {
      const chat = open(id)
      if (chat.messages.length > 0 && !stale.has(id)) return Promise.resolve()
      const pending =
        loading.get(id) ??
        readConversation(id)
          .then((messages) => {
            if (chat.status === "submitted" || chat.status === "streaming") return
            chat.messages = messages
            if (messages.some((message) => message.metadata?.reply?.state === "streaming")) stale.add(id)
            else stale.delete(id)
          })
          .catch((error: unknown) => {
            if (
              error instanceof ReplyProblem &&
              error.status === 404 &&
              chat.messages.length > 0 &&
              chat.messages.every((message) => message.role === "user")
            )
              return
            throw error
          })
          .finally(() => loading.delete(id))
      loading.set(id, pending)
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
