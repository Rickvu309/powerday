import { ConversationId, type ChatMessage, type ModelId } from "@powerday/chat-core"
import type { ChatTransport } from "ai"
import { createContext } from "react"
import type { createSession } from "./chat-session"
import { readOpenConversation, subscribeOpenConversation } from "../../open-conversation"
import { ReplyProblem } from "./reply-problem"

type Attempt =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing" | "preparation-failed" | "cancelled"; readonly text: string; readonly model: ModelId }
  | { readonly kind: "pending"; readonly operation: "send" | "retry"; readonly dispatch: boolean }
  | { readonly kind: "failed"; readonly error: Error }

type Session = ReturnType<typeof createSession>
type ConversationView = {
  readonly attempt: Attempt
  readonly stopped: ReadonlySet<string>
  readonly Content: Session["Content"] | undefined
}

const editableDraft = () => {
  let text = ""
  const listeners = new Set<() => void>()
  return {
    read: () => text,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    edit: (next: string) => {
      if (text === next) return
      text = next
      for (const listener of listeners) listener()
    },
  }
}

export const liveChats = (transport?: ChatTransport<ChatMessage>, seed: ChatMessage[] = [], initialModel?: ModelId) => {
  const create = (
    id: ConversationId,
    messages: ChatMessage[] = [],
    initialHistory: "current" | "unloaded" = "unloaded",
  ) => {
    let session: Session | undefined
    let attaching: Promise<Session> | undefined
    const attach = () => {
      attaching ??= import("./chat-session")
        .then(({ createSession }) => {
          session ??= createSession({ id, messages, transport })
          publish({ ...view, Content: session.Content })
          return session
        })
        .catch((error: unknown) => {
          attaching = undefined
          throw error
        })
      return attaching
    }
    const draft = editableDraft()
    let view: ConversationView = { attempt: { kind: "idle" }, stopped: new Set(), Content: undefined }
    const listeners = new Set<() => void>()
    let history: "current" | "unloaded" | "stale" = initialHistory
    let revision = 0
    let confirmSent: (() => void) | undefined
    let reading: Promise<ChatMessage[]> | undefined
    const busy = () => session?.chat.status === "submitted" || session?.chat.status === "streaming"
    const publish = (next: ConversationView) => {
      view = next
      for (const listener of listeners) listener()
    }
    const readHistory = () => {
      reading ??= attach()
        .then((session) => session.readHistory())
        .finally(() => {
          reading = undefined
        })
      return reading
    }
    const run = (operation: "send" | "retry", work: () => Promise<void>) => {
      if (!["idle", "failed"].includes(view.attempt.kind) || busy()) return false
      revision++
      publish({ ...view, attempt: { kind: "pending", operation, dispatch: operation === "send" } })
      void work().then(
        () => {
          if (session?.chat.error === undefined && session?.chat.status === "ready") {
            confirmSent?.()
            confirmSent = undefined
          }
          publish({ ...view, attempt: { kind: "idle" } })
        },
        (error: unknown) =>
          publish({
            ...view,
            attempt: { kind: "failed", error: error instanceof Error ? error : new Error("The attempt failed.") },
          }),
      )
      return true
    }
    const prepare = ({ text, model }: { text: string; model: ModelId }) => {
      const request = { text, model }
      const intent = { kind: "preparing", ...request } as const
      publish({ ...view, attempt: intent })
      const cancel = () => {
        if (view.attempt === intent) publish({ ...view, attempt: { ...request, kind: "cancelled" } })
      }
      const unsubscribe =
        typeof window === "undefined"
          ? () => {}
          : subscribeOpenConversation(() => {
              if (readOpenConversation() !== id) cancel()
            })
      if (typeof window !== "undefined") window.addEventListener("pagehide", cancel, { once: true })
      void attach()
        .then(
          ({ chat }) => {
            if (view.attempt !== intent) return
            publish({ ...view, attempt: { kind: "idle" } })
            run("send", () => chat.sendMessage({ text: request.text }, { body: { model: request.model } }))
          },
          () => {
            if (view.attempt === intent) publish({ ...view, attempt: { ...request, kind: "preparation-failed" } })
          },
        )
        .finally(() => {
          unsubscribe()
          if (typeof window !== "undefined") window.removeEventListener("pagehide", cancel)
        })
    }
    if (messages.length > 0)
      void attach().then(({ chat }) => {
        if (initialModel !== undefined) run("send", () => chat.regenerate({ body: { model: initialModel } }))
      })
    return {
      id,
      retryPreparation: () => {
        const attempt = view.attempt
        if (attempt.kind === "preparation-failed" || attempt.kind === "cancelled") prepare(attempt)
      },
      discardPreparation: () => {
        if (view.attempt.kind === "preparation-failed" || view.attempt.kind === "cancelled")
          publish({ ...view, attempt: { kind: "idle" } })
      },
      draft,
      problem: () => session?.chat.error,
      read: () => view,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      needsLoad: () => history !== "current",
      load: async () => {
        if (history === "current" || busy() || !["idle", "failed"].includes(view.attempt.kind)) return
        const started = revision
        const { chat } = await attach()
        if (revision !== started || busy() || !["idle", "failed"].includes(view.attempt.kind)) return
        try {
          const messages = await readHistory()
          if (revision !== started || busy()) return
          chat.messages = messages
          history = messages.some((message) => message.metadata?.reply?.state === "streaming") ? "stale" : "current"
          if (history === "current") publish({ ...view, stopped: new Set() })
        } catch (error) {
          if (revision !== started || busy()) return
          if (
            error instanceof ReplyProblem &&
            error.status === 404 &&
            chat.messages.length > 0 &&
            chat.messages.every((message) => message.role === "user")
          )
            return
          throw error
        }
      },
      send: ({
        text,
        model,
        onSent,
      }: {
        text: string
        model: ModelId
        onSent?: () => void
      }): ConversationId | undefined => {
        const said = text.trim()
        if (said === "") return undefined
        if (!["idle", "failed"].includes(view.attempt.kind) || busy()) return undefined
        revision++
        draft.edit("")
        confirmSent = onSent
        prepare({ text: said, model })
        promote(id)
        return id
      },
      retry: ({ model }: { model: ModelId }) => {
        const chat = session?.chat
        if (chat === undefined || !chat.messages.some((message) => message.role === "user")) return
        run("retry", async () => {
          const question = chat.messages.findLast((message) => message.role === "user")
          if (question === undefined) return
          const error = chat.error
          if (error instanceof ReplyProblem && [401, 422, 429, 501].includes(error.status)) {
            publish({ ...view, attempt: { kind: "pending", operation: "retry", dispatch: true } })
            await chat.regenerate({ body: { model } })
            return
          }
          let saved
          try {
            saved = await readHistory()
          } catch (error) {
            if (!(error instanceof ReplyProblem && error.status === 404)) throw error
          }
          const savedQuestion = saved?.find((message) => message.id === question.id && message.role === "user")
          if (saved === undefined || savedQuestion === undefined) {
            publish({ ...view, attempt: { kind: "pending", operation: "retry", dispatch: true } })
            await chat.regenerate({ body: { model } })
          } else {
            chat.messages = saved
            if (saved.some((message) => message.metadata?.reply?.state === "streaming")) throw new ReplyProblem(409)
            history = "current"
            publish({ ...view, stopped: new Set() })
            publish({ ...view, attempt: { kind: "pending", operation: "retry", dispatch: true } })
            await chat.sendMessage({ role: "user", parts: savedQuestion.parts }, { body: { model } })
          }
        })
      },
      stopDisplay: () => {
        const chat = session?.chat
        if (chat === undefined) return
        revision++
        history = "stale"
        const last = chat.messages.at(-1)
        if (last !== undefined) publish({ ...view, stopped: new Set([...view.stopped, last.id]) })
        void chat.stop()
      },
    }
  }
  const conversations = new Map<ConversationId, ReturnType<typeof create>>()
  let draft = create(ConversationId.parse(crypto.randomUUID()), seed, "current")
  conversations.set(draft.id, draft)
  function promote(id: ConversationId): void {
    if (draft.id !== id) return
    draft = create(ConversationId.parse(crypto.randomUUID()), [], "current")
    conversations.set(draft.id, draft)
  }
  return {
    open: (id: ConversationId | null) => {
      if (id === null) return draft
      const conversation = conversations.get(id) ?? create(id)
      conversations.set(id, conversation)
      return conversation
    },
  }
}

export type LiveChatStore = ReturnType<typeof liveChats>
export type LiveConversation = ReturnType<LiveChatStore["open"]>

export const LiveChats = createContext(liveChats())
