import { Chat, useChat } from "@ai-sdk/react"
import { MessageMetadata, type ChatMessage, type ConversationId } from "@powerday/chat-core"
import { DefaultChatTransport, type ChatTransport } from "ai"
import { lazy, Suspense, type ReactNode } from "react"
import { readConversation } from "./read-conversation"
import { chatFetch } from "./reply-problem"

const Thread = lazy(() => import("./thread"))

type ContentProps = {
  empty: ReactNode
  stopped: ReadonlySet<string>
  attemptError: Error | undefined
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
  function Content({ empty, stopped, attemptError, onRetry, onSignIn }: ContentProps) {
    const { messages, status, error } = useChat({ chat, throttle: 32 })
    if (messages.length === 0) return empty
    return (
      <Suspense fallback={<div className="flex-1" />}>
        <Thread
          messages={messages}
          status={status}
          error={attemptError ?? error}
          stopped={stopped}
          onRetry={onRetry}
          onSignIn={onSignIn}
        />
      </Suspense>
    )
  }
  return { chat, readHistory: () => readConversation(id), Content }
}
