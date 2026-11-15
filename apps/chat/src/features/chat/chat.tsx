import type { ConversationId } from "@powerday/chat-core"
import { useChat } from "@ai-sdk/react"
import { lazy, Suspense, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react"
import { useModels } from "@/features/model-picker/model-choice"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { Composer } from "./composer"
import { LiveChats, type LiveChatStore } from "./live-chats"
import { Suggestions } from "./suggestions"
import { problemOf } from "./reply-problem"
import { Button } from "@/components/ui/button"

const loadThread = () => import("./thread")
const Thread = lazy(loadThread)

export function Chat() {
  const live = useContext(LiveChats)
  const open = useOpenConversation()
  return <ChatSession key={open ?? "draft"} open={open} live={live} />
}

function ChatSession({ open, live }: { open: ConversationId | null; live: LiveChatStore }) {
  const conversation = live.open(open)
  const { messages, status, error } = useChat({ chat: conversation.chat, throttle: 32 })
  const view = useSyncExternalStore(conversation.subscribe, conversation.read)
  const [history, setHistory] = useState<{ state: "loading" | "ready" } | { state: "error"; error: unknown }>({
    state: open === null || !conversation.needsLoad() ? "ready" : "loading",
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (open === null || !conversation.needsLoad()) return
    let current = true
    setHistory({ state: "loading" })
    void conversation.load().then(
      () => {
        if (current) setHistory({ state: "ready" })
      },
      (error: unknown) => {
        if (current) setHistory({ state: "error", error })
      },
    )
    return () => {
      current = false
    }
  }, [open, conversation, attempt])
  const { models } = useModels()
  const model = models.state === "ready" ? models.chosen : undefined
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    void loadThread()
  }, [])

  const send = useCallback(
    (text: string): boolean => {
      if (model === undefined) return false
      const id = conversation.send({ text, model: model.id })
      if (id === undefined) return false
      if (open === null) openConversation(id)
      return true
    },
    [model, conversation, open],
  )
  const retry = useCallback(() => {
    if (model !== undefined) conversation.retry({ model: model.id })
  }, [model, conversation])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {history.state === "loading" ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading conversation…
        </div>
      ) : history.state === "error" ? (
        <div role="alert" className="m-auto flex max-w-sm flex-col items-center gap-4 p-4 text-center text-sm">
          <p>{problemOf(history.error)}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </div>
      ) : messages.length === 0 ? (
        <Suggestions ready={model !== undefined} onPick={send} />
      ) : (
        <Suspense fallback={<div className="flex-1" />}>
          <Thread
            messages={messages}
            status={status}
            error={view.attempt.kind === "failed" ? view.attempt.error : error}
            stopped={view.stopped}
            onRetry={retry}
          />
        </Suspense>
      )}
      <Composer
        draft={conversation.draft}
        busy={busy}
        ready={model !== undefined && history.state === "ready" && view.attempt.kind !== "pending"}
        onSend={send}
        onStop={conversation.stopDisplay}
      />
    </div>
  )
}
