import {
  ConversationId,
  ModelId,
  pageSize,
  titleOf,
  UserId,
  type ChatMessage,
  type Conversation,
  type SavedConversation,
} from "@powerday/chat-core"
import type { ConversationApi } from "./conversation-api"

const questions = [
  "Plan a two-day hiking trip around Đà Lạt",
  "Explain how D1 read replicas route queries",
  "Draft a polite reply declining the vendor renewal",
  "What is the difference between useMemo and useCallback?",
  "Summarize the quarterly forecast for the board",
  "Write a phở recipe for six people",
  "Compare Postgres full text search with SQLite FTS5",
  "Help me prepare for a senior frontend interview",
  "Turn these meeting notes into an agenda",
  "Why does my Worker hit the CPU limit on large JSON?",
  "Suggest names for a coffee shop near the river",
  "Translate this contract clause into plain Vietnamese",
]

const reply =
  "Here is a short answer to get you started. I can go deeper on any part, add examples, or turn it into a checklist."

const minute = 60_000

const daysAgo = (index: number) => (index < 6 ? 1 : index < 12 ? index - 4 : index * 3)

export const sampleConversations = (count: number, now = new Date()): SavedConversation[] =>
  Array.from({ length: count }, (_, index) => {
    const question = `${questions[index % questions.length]}${index < questions.length ? "" : ` (${Math.floor(index / questions.length) + 1})`}`
    const messages: ChatMessage[] = [
      { id: `q${index}`, role: "user", parts: [{ type: "text", text: question }] },
      { id: `a${index}`, role: "assistant", parts: [{ type: "text", text: reply }] },
    ]
    const at =
      index < 3
        ? new Date(now.getTime() - index * minute)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo(index), 12)
    const conversation: Conversation = {
      id: ConversationId.parse(`sample-${index}`),
      owner: UserId.parse("sample"),
      title: titleOf(messages),
      model: ModelId.parse("mock"),
      createdAt: at,
      updatedAt: at,
    }
    return { conversation, messages }
  })

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })

export const sampleApi = (saved: SavedConversation[], latency = 0): ConversationApi => {
  const byId = new Map(saved.map((each) => [each.conversation.id, each]))
  const all = () => [...byId.values()].map((each) => each.conversation)
  return {
    list: async (before) => {
      await wait(latency)
      const start =
        before === undefined ? 0 : all().findIndex((each) => each.id === before.slice(before.indexOf(".") + 1)) + 1
      const conversations = all().slice(start, start + pageSize)
      const last = conversations.at(-1)
      return start + pageSize < byId.size && last
        ? { conversations, next: `${last.updatedAt.getTime()}.${last.id}` }
        : { conversations }
    },
    get: async (id) => {
      await wait(latency)
      return byId.get(id)
    },
    search: async (query, signal) => {
      await wait(latency, signal)
      const words = query.toLowerCase().split(/\s+/)
      const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word))
      return [...byId.values()]
        .flatMap(({ conversation, messages }) => {
          const texts = messages.flatMap((message) =>
            message.parts.flatMap((part) => ("text" in part ? [part.text] : [])),
          )
          const snippet = texts.find(matches) ?? ""
          return snippet || matches(conversation.title) ? [{ conversation, snippet }] : []
        })
        .slice(0, 20)
    },
    rename: async (id, title) => {
      const saved = byId.get(id)
      if (saved) byId.set(id, { ...saved, conversation: { ...saved.conversation, title } })
    },
    delete: async (id) => {
      byId.delete(id)
    },
  }
}
