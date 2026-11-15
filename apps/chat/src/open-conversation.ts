import { ConversationId } from "@powerday/chat-core"
import { useSyncExternalStore } from "react"

const prefix = "/c/"

export const subscribeOpenConversation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

const decoded = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return ""
  }
}

export const readOpenConversation = () => {
  const path = window.location.pathname
  if (!path.startsWith(prefix)) return null
  const parsed = ConversationId.safeParse(decoded(path.slice(prefix.length)))
  return parsed.success ? parsed.data : null
}

export const useOpenConversation = () =>
  useSyncExternalStore(subscribeOpenConversation, readOpenConversation, () => null)

export const openConversation = (id: ConversationId | null) => {
  window.history.pushState(null, "", id === null ? "/" : `${prefix}${encodeURIComponent(id)}`)
  window.dispatchEvent(new PopStateEvent("popstate"))
}
