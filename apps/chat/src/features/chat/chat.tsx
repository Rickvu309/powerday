import type { ConversationId } from "@powerday/chat-core"
import { useChat } from "@ai-sdk/react"
import { lazy, Suspense, useCallback, useContext, useEffect, useState } from "react"
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
  const chat = live.open(open)
  const { messages, status, error, sendMessage, regenerate, stop } = useChat({ chat, throttle: 32 })
  const [history, setHistory] = useState<{ state: "loading" | "ready" } | { state: "error"; error: unknown }>({
    state: open === null || chat.messages.length > 0 ? "ready" : "loading",
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (open === null || chat.messages.length > 0) return
    let current = true
    setHistory({ state: "loading" })
    void live.load(open).then(
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
  }, [open, live, chat, attempt])
  const { models } = useModels()
  const model = models.state === "ready" ? models.chosen : undefined
  const [stopped, setStopped] = useState<ReadonlySet<string>>(new Set())
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    void loadThread()
  }, [])

  const send = useCallback(
    (text: string) => {
      if (model === undefined) return
      void sendMessage({ text }, { body: { model: model.id } })
      if (open === null) openConversation(live.start())
    },
    [model, sendMessage, open, live],
  )

  const retry = useCallback(() => {
    if (model !== undefined) void regenerate({ body: { model: model.id } })
  }, [model, regenerate])

  const halt = useCallback(() => {
    const last = chat.messages.at(-1)
    if (last !== undefined) setStopped((ids) => new Set(ids).add(last.id))
    void stop()
  }, [chat, stop])

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
          <Thread messages={messages} status={status} error={error} stopped={stopped} onRetry={retry} />
        </Suspense>
      )}
      <Composer busy={busy} ready={model !== undefined && history.state === "ready"} onSend={send} onStop={halt} />
    </div>
  )
}
