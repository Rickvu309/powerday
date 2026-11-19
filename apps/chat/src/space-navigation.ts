import { useSyncExternalStore, type MouseEvent } from "react"
import { subscribeOpenConversation } from "@/open-conversation"

export type Space = "chat" | "admin" | "office"

let chatPath = "/"

const normalize = (path: string) => path.replace(/\/$/, "") || "/"
const navigate = (path: string) => {
  history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}
const follow = (event: MouseEvent, path: string) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(path)
}

const rememberChat = () => {
  const current = normalize(location.pathname)
  if (current === "/" || current.startsWith("/c/")) chatPath = current
}

export const enterSpace = (event: MouseEvent, path: string) => {
  rememberChat()
  follow(event, path)
}
export const goSpace = (path: string) => {
  rememberChat()
  navigate(path)
}
export const returnChat = (event: MouseEvent) => follow(event, chatPath)
export const chatHref = () => chatPath

export const readSpace = (): Space => {
  const path = location.pathname.replace(/\/$/, "")
  if (path === "/admin") return "admin"
  if (path === "/office") return "office"
  return "chat"
}

export const useSpace = () => useSyncExternalStore<Space>(subscribeOpenConversation, readSpace, () => "chat")
