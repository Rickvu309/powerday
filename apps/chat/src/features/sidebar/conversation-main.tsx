import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import { readConversationNavigation, subscribeOpenConversation, useOpenConversation } from "@/open-conversation"
import { useConversationCache, useListing } from "./conversation-cache"

export function ConversationMain({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  const id = useOpenConversation()
  const cache = useConversationCache()
  const listing = useListing()
  const savedTitle = useSyncExternalStore(cache.subscribe, () => (id === null ? undefined : cache.title(id)))
  const navigation = useSyncExternalStore(subscribeOpenConversation, readConversationNavigation, () => 0)
  const focused = useRef(navigation)
  const main = useRef<HTMLElement>(null)
  const listedTitle =
    listing.status === "ready" ? listing.conversations.find((each) => each.id === id)?.title : undefined
  const title = id === null ? "New chat" : (listedTitle ?? savedTitle ?? "Conversation")
  const ready = useSyncExternalStore(cache.subscribe, () => id === null || cache.contentReady(id))

  useEffect(() => {
    if (!paused) document.title = id === null ? "Power Chat" : title
  }, [id, paused, title])

  useEffect(() => {
    if (paused) {
      focused.current = navigation
      return
    }
    if (!ready || focused.current === navigation) return
    const frame = requestAnimationFrame(() => {
      main.current?.closest("main")?.focus({ preventScroll: true })
      focused.current = navigation
    })
    return () => cancelAnimationFrame(frame)
  }, [navigation, paused, ready])

  return (
    <section ref={main} aria-labelledby="conversation-title" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h1
        id="conversation-title"
        className={
          id === null
            ? "sr-only"
            : "mx-auto w-full max-w-3xl px-4 py-2 text-sm font-medium leading-[1.4] [overflow-wrap:anywhere] max-md:line-clamp-2"
        }
      >
        {title}
      </h1>
      {children}
    </section>
  )
}
