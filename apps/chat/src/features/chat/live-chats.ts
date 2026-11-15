import { Chat } from "@ai-sdk/react"
import { ConversationId, MessageMetadata, type ChatMessage, type ModelId } from "@powerday/chat-core"
import { DefaultChatTransport, generateId, type ChatTransport } from "ai"
import { createContext } from "react"
import { readConversation } from "./read-conversation"
import { chatFetch, ReplyProblem } from "./reply-problem"

type Attempt =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly operation: "send" | "retry" }
  | { readonly kind: "failed"; readonly error: Error }

type ConversationView = { readonly attempt: Attempt; readonly stopped: ReadonlySet<string> }

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

export const liveChats = (transport: ChatTransport<ChatMessage>, seed: ChatMessage[] = []) => {
  const create = (
    id: ConversationId,
    messages: ChatMessage[] = [],
    initialHistory: "current" | "unloaded" = "unloaded",
  ) => {
    const chat = new Chat<ChatMessage>({ id, transport, messages, messageMetadataSchema: MessageMetadata.optional() })
    const draft = editableDraft()
    let view: ConversationView = { attempt: { kind: "idle" }, stopped: new Set() }
    const listeners = new Set<() => void>()
    let history: "current" | "unloaded" | "stale" = initialHistory
    let revision = 0
    let reading: Promise<ChatMessage[]> | undefined
    const busy = () => chat.status === "submitted" || chat.status === "streaming"
    const publish = (next: ConversationView) => {
      view = next
      for (const listener of listeners) listener()
    }
    const readHistory = () => {
      reading ??= readConversation(id).finally(() => {
        reading = undefined
      })
      return reading
    }
    const run = (operation: "send" | "retry", work: () => Promise<void>) => {
      if (view.attempt.kind === "pending" || busy()) return false
      revision++
      publish({ ...view, attempt: { kind: "pending", operation } })
      void work().then(
        () => publish({ ...view, attempt: { kind: "idle" } }),
        (error: unknown) =>
          publish({
            ...view,
            attempt: { kind: "failed", error: error instanceof Error ? error : new Error("The attempt failed.") },
          }),
      )
      return true
    }
    return {
      chat,
      draft,
      read: () => view,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      needsLoad: () => history !== "current",
      load: async () => {
        if (history === "current") return
        const started = revision
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
      send: ({ text, model }: { text: string; model: ModelId }): ConversationId | undefined => {
        const said = text.trim()
        if (said === "") return undefined
        if (
          !run("send", async () => {
            draft.edit("")
            await chat.sendMessage({ text: said }, { body: { model } })
          })
        )
          return undefined
        promote(id)
        return id
      },
      retry: ({ model }: { model: ModelId }) => {
        if (!chat.messages.some((message) => message.role === "user")) return
        run("retry", async () => {
          const question = chat.messages.findLast((message) => message.role === "user")
          if (question === undefined) return
          const error = chat.error
          if (error instanceof ReplyProblem && [401, 422, 429, 501].includes(error.status)) {
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
            await chat.regenerate({ body: { model } })
          } else {
            chat.messages = saved
            if (saved.some((message) => message.metadata?.reply?.state === "streaming")) throw new ReplyProblem(409)
            history = "current"
            publish({ ...view, stopped: new Set() })
            await chat.sendMessage({ role: "user", parts: savedQuestion.parts }, { body: { model } })
          }
        })
      },
      stopDisplay: () => {
        revision++
        history = "stale"
        const last = chat.messages.at(-1)
        if (last !== undefined) publish({ ...view, stopped: new Set([...view.stopped, last.id]) })
        void chat.stop()
      },
    }
  }
  const conversations = new Map<ConversationId, ReturnType<typeof create>>()
  let draft = create(ConversationId.parse(generateId()), seed, "current")
  conversations.set(ConversationId.parse(draft.chat.id), draft)
  function promote(id: ConversationId): void {
    if (draft.chat.id !== id) return
    draft = create(ConversationId.parse(generateId()), [], "current")
    conversations.set(ConversationId.parse(draft.chat.id), draft)
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
