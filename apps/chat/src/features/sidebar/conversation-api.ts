import {
  Conversation,
  ConversationPage,
  Found,
  type ChatMessage,
  type ConversationId,
  type SavedConversation,
} from "@powerday/chat-core"

export type ConversationApi = {
  readonly list: (before: string | undefined) => Promise<ConversationPage>
  readonly get: (id: ConversationId) => Promise<SavedConversation | undefined>
  readonly search: (query: string, signal: AbortSignal) => Promise<readonly Found[]>
  readonly rename: (id: ConversationId, title: string) => Promise<void>
  readonly delete: (id: ConversationId) => Promise<void>
}

const call = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, init)
  if (!response.ok && response.status !== 404)
    throw new Error(`${init?.method ?? "GET"} ${path} answered ${response.status}`)
  return response
}

const mutate = async (path: string, init: RequestInit) => {
  const response = await call(path, init)
  if (!response.ok) throw new Error(`${init.method} ${path} answered ${response.status}`)
}

const path = (id: ConversationId) => `/api/conversations/${encodeURIComponent(id)}`

export const httpApi: ConversationApi = {
  list: async (before) => {
    const query = before === undefined ? "" : `?${new URLSearchParams({ before })}`
    return ConversationPage.parse(await (await call(`/api/conversations${query}`)).json())
  },
  get: async (id) => {
    const response = await call(path(id))
    if (response.status === 404) return undefined
    const body: { conversation: unknown; messages: ChatMessage[] } = await response.json()
    return { conversation: Conversation.parse(body.conversation), messages: body.messages }
  },
  search: async (query, signal) => {
    const response = await call(`/api/conversations?${new URLSearchParams({ q: query })}`, { signal })
    const body: { found: unknown } = await response.json()
    return Found.array().parse(body.found)
  },
  rename: async (id, title) => {
    await mutate(path(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
  },
  delete: async (id) => {
    await mutate(path(id), { method: "DELETE" })
  },
}
