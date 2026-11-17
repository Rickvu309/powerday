import { Chat, useChat } from "@ai-sdk/react"
import { MessageMetadata, type ChatMessage, type ConversationId } from "@powerday/chat-core"
import { DefaultChatTransport, type ChatTransport } from "ai"
import { lazy, Suspense, type ReactNode } from "react"
import { readConversation } from "./read-conversation"
import { chatFetch } from "./reply-problem"

import { ThreadLoading } from "./thread-loading"
import { preloadThread } from "./thread-loader"
const Thread = lazy(preloadThread)

type ContentProps = {
  empty: ReactNode
  stopped: ReadonlySet<string>
  attemptError: Error | undefined
  onRefresh: () => void
  onRetry: () => void
  onSignIn: (question: string, saved: boolean) => void
}

export const createSession = ({
  id,
  messages,
  transport,
}: {
  id: ConversationId
  messages: ChatMessage[]
  transport: ChatTransport<ChatMessage> | undefined
}) => {
  const chat = new Chat<ChatMessage>({
    id,
    messages,
    messageMetadataSchema: MessageMetadata.optional(),
    transport:
      transport ??
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        fetch: chatFetch,
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { id, model: body?.model, message: messages.findLast((message) => message.role === "user") },
        }),
      }),
  })
  function Content({ empty, stopped, attemptError, onRetry, onSignIn, onRefresh }: ContentProps) {
    const { messages, status, error } = useChat({ chat, throttle: 32 })
    if (messages.length === 0) return empty
    return (
      <Suspense
        fallback={
          <ThreadLoading
            question={
              messages
                .findLast((message) => message.role === "user")
                ?.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("\n\n") ?? ""
            }
          />
        }
      >
        <Thread
          messages={messages}
          status={status}
          error={attemptError ?? error}
          stopped={stopped}
          onRefresh={onRefresh}
          onRetry={onRetry}
          onSignIn={onSignIn}
        />
      </Suspense>
    )
  }
  return { chat, readHistory: () => readConversation(id), Content }
}
