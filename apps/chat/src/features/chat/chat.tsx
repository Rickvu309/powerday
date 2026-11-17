import type { ConversationId } from "@powerday/chat-core"
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react"
import { useModels } from "@/features/model-picker/model-choice"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { Composer } from "./composer"
import { LiveChats, type LiveConversation } from "./live-chats"
import { Suggestions } from "./suggestions"
import { useLimitReset } from "./over-limit"
import { problemOf, usageLimitOf } from "./reply-problem"
import { Button } from "@/components/ui/button"

export function Chat() {
  const live = useContext(LiveChats)
  const open = useOpenConversation()
  const conversation = live.open(open)
  return <ChatSession key={conversation.id} open={open} conversation={conversation} />
}

function ChatSession({ open, conversation }: { open: ConversationId | null; conversation: LiveConversation }) {
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
  const busy = view.attempt.kind === "pending" && view.attempt.dispatch
  const limit = usageLimitOf(conversation.problem())
  const reset = useLimitReset(limit?.resetsAt)
  const blocked = limit?.resetsAt !== undefined && !reset

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
      ) : view.attempt.kind === "preparing" ||
        view.attempt.kind === "preparation-failed" ||
        view.attempt.kind === "cancelled" ? (
        <div className="m-auto flex max-w-sm flex-col gap-4 p-4 text-sm">
          <p>{view.attempt.text}</p>
          {view.attempt.kind === "preparing" ? (
            <p role="status">Getting your conversation ready…</p>
          ) : (
            <div role="alert">
              <p>Your question hasn’t been sent. Try again, or reload if the problem continues.</p>
              <Button variant="outline" onClick={conversation.retryPreparation}>
                Try again
              </Button>
              <Button variant="ghost" onClick={conversation.discardPreparation}>
                Discard question
              </Button>
            </div>
          )}
        </div>
      ) : view.Content ? (
        <view.Content
          empty={<Suggestions ready={model !== undefined} onPick={send} />}
          stopped={view.stopped}
          attemptError={view.attempt.kind === "failed" ? view.attempt.error : undefined}
          onRetry={retry}
        />
      ) : (
        <Suggestions ready={model !== undefined} onPick={send} />
      )}
      <Composer
        draft={conversation.draft}
        busy={busy}
        ready={
          !blocked &&
          model !== undefined &&
          history.state === "ready" &&
          (view.attempt.kind === "idle" || view.attempt.kind === "failed")
        }
        onSend={send}
        onStop={conversation.stopDisplay}
      />
    </div>
  )
}
