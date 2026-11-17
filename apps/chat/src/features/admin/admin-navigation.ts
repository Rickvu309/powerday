import { useSyncExternalStore, type MouseEvent } from "react"
import { subscribeOpenConversation } from "@/open-conversation"

let chatPath = "/"
const navigate = (path: string) => {
  history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}
const follow = (event: MouseEvent, path: string) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(path)
}
export const enterAdmin = (event: MouseEvent) => {
  if (location.pathname !== "/admin") chatPath = location.pathname
  follow(event, "/admin")
}
export const leaveAdmin = (event: MouseEvent) => follow(event, chatPath)
export const returnPath = () => chatPath
export const useAdminPage = () =>
  useSyncExternalStore(
    subscribeOpenConversation,
    () => location.pathname.replace(/\/$/, "") === "/admin",
    () => false,
  )
