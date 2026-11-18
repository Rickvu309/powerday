import type { ConversationId } from "@powerday/chat-core"
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useAccount } from "@/features/auth/session"
import { useModels } from "@/features/model-picker/model-choice"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { rememberConversationContentReady } from "../sidebar/conversation-cache"
import { Composer } from "./composer"
import { LiveChats, type LiveConversation } from "./live-chats"
import { Greeting } from "./greeting"
import { useLimitReset } from "./over-limit"
import { usageLimitOf } from "./reply-problem"
import { ConversationProblem } from "./conversation-problem"
import { clearKeptDraft, readKeptDraft, reviseKeptDraft, signInKeepingDraft } from "./kept-draft"
import { UnkeptDraft } from "./unkept-draft"
import { Button } from "@/components/ui/button"

export function Chat({ paused = false }: { paused?: boolean }) {
  const live = useContext(LiveChats)
  const current = useOpenConversation()
  const previous = useRef(current)
  if (!paused) previous.current = current
  const open = previous.current
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
    if (history.state === "ready" && view.Content !== undefined) rememberConversationContentReady(conversation.id)
  }, [conversation.id, history.state, view.Content])

  const account = useAccount()
  const owner = account.status === "signed-in" ? account.userId : undefined

  useEffect(() => {
    if (owner === undefined) return
    const kept = readKeptDraft(owner)
    if (kept !== "") conversation.draft.edit(kept)
  }, [owner, conversation])

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
      if (owner !== undefined) reviseKeptDraft(owner, text)
      const id = conversation.send({
        text,
        model: model.id,
        onSent: () => {
          if (owner !== undefined) clearKeptDraft(owner, text)
        },
      })
      if (id === undefined) return false
      if (open === null) openConversation(id)
      return true
    },
    [model, conversation, open, owner],
  )
  const retry = useCallback(() => {
    if (model !== undefined) conversation.retry({ model: model.id })
  }, [model, conversation])
  const [unkept, setUnkept] = useState<{ draft: string; path: string }>()
  const signIn = useCallback(
    (question: string, saved: boolean) => {
      const draft = [question, conversation.draft.read()].filter((text) => text.trim() !== "").join("\n\n")
      const path = saved ? location.pathname : "/"
      if (!signInKeepingDraft(owner, draft, path)) setUnkept({ draft, path })
    },
    [owner, conversation],
  )

  return (
    <div className="group/chat flex min-h-0 flex-1 flex-col md:has-data-chat-empty:justify-center-safe md:has-data-chat-empty:pb-[6vh]">
      {history.state === "loading" ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading conversation…
        </div>
      ) : history.state === "error" ? (
        <ConversationProblem
          error={history.error}
          onRetry={() => setAttempt((value) => value + 1)}
          onSignIn={() => signIn("", true)}
          onNewChat={() => openConversation(null)}
        />
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
          empty={<Greeting />}
          onRefresh={() => {
            void conversation.load().catch((error: unknown) => setHistory({ state: "error", error }))
          }}
          stopped={view.stopped}
          attemptError={view.attempt.kind === "failed" ? view.attempt.error : undefined}
          onRetry={retry}
          onSignIn={signIn}
        />
      ) : (
        <Greeting />
      )}
      {unkept && <UnkeptDraft draft={unkept.draft} onSignIn={() => location.assign(unkept.path)} />}
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
