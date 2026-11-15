import type { Conversation, ConversationId, SavedConversation } from "@powerday/chat-core"
import { createContext, useContext, useEffect, useSyncExternalStore } from "react"
import { httpApi, type ConversationApi } from "./conversation-api"

export type Listing =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly conversations: readonly Conversation[]; readonly next: string | undefined }

export type Opened =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly saved: SavedConversation }

export const createConversationCache = (api: ConversationApi) => {
  let listing: Listing = { status: "loading" }
  let loading: Promise<void> | undefined
  const opened = new Map<ConversationId, Opened>()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  const fetchPage = (before: string | undefined) => {
    if (loading) return
    loading = api
      .list(before)
      .then(
        (page) => {
          const earlier = before !== undefined && listing.status === "ready" ? listing.conversations : []
          listing = { status: "ready", conversations: [...earlier, ...page.conversations], next: page.next }
        },
        () => {
          if (before === undefined) listing = { status: "failed" }
        },
      )
      .finally(() => {
        loading = undefined
        emit()
      })
  }

  const reload = () => {
    listing = { status: "loading" }
    emit()
    fetchPage(undefined)
  }

  const change = (id: ConversationId, update: (conversation: Conversation) => Conversation | undefined) => {
    if (listing.status === "ready") {
      const conversations = listing.conversations.flatMap((each) => (each.id === id ? (update(each) ?? []) : [each]))
      listing = { ...listing, conversations }
    }
    const state = opened.get(id)
    const updated = state?.status === "ready" ? update(state.saved.conversation) : undefined
    if (state?.status === "ready" && updated)
      opened.set(id, { status: "ready", saved: { ...state.saved, conversation: updated } })
    if (state && !updated) opened.delete(id)
    emit()
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listing: () => listing,
    opened: (id: ConversationId) => opened.get(id),
    load: () => {
      if (listing.status !== "ready") fetchPage(undefined)
    },
    more: () => {
      if (listing.status === "ready" && listing.next !== undefined) fetchPage(listing.next)
    },
    open: (id: ConversationId) => {
      if ((opened.get(id)?.status ?? "failed") !== "failed") return
      opened.set(id, { status: "loading" })
      emit()
      api
        .get(id)
        .then(
          (saved) => opened.set(id, saved ? { status: "ready", saved } : { status: "missing" }),
          () => opened.set(id, { status: "failed" }),
        )
        .finally(emit)
    },
    remember: (saved: SavedConversation) => {
      const { conversation } = saved
      opened.set(conversation.id, { status: "ready", saved })
      if (listing.status === "ready") {
        const others = listing.conversations.filter((each) => each.id !== conversation.id)
        listing = { ...listing, conversations: [conversation, ...others] }
      }
      emit()
    },
    rename: (id: ConversationId, title: string) => {
      change(id, (conversation) => ({ ...conversation, title }))
      api.rename(id, title).catch(reload)
    },
    delete: (id: ConversationId) => {
      change(id, () => undefined)
      api.delete(id).catch(reload)
    },
    search: api.search,
  }
}

export type ConversationCache = ReturnType<typeof createConversationCache>

const CacheContext = createContext(createConversationCache(httpApi))

export const ConversationCacheProvider = CacheContext

export const useConversationCache = () => useContext(CacheContext)

export const useListing = () => {
  const cache = useConversationCache()
  useEffect(() => cache.load(), [cache])
  return useSyncExternalStore(cache.subscribe, cache.listing)
}

export const useSavedConversation = (id: ConversationId | null) => {
  const cache = useConversationCache()
  useEffect(() => {
    if (id !== null) cache.open(id)
  }, [cache, id])
  return useSyncExternalStore(cache.subscribe, () => (id === null ? undefined : cache.opened(id)))
}
