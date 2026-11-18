import { useSyncExternalStore, type MouseEvent } from "react"
import { cn } from "cn"
import { chatHref, enterSpace, returnChat, useSpace } from "@/space-navigation"
import { subscribeOpenConversation } from "@/open-conversation"

const pill =
  "flex h-8 min-w-[6.75rem] items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-(--motion-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"

export function SpaceSwitch({ className }: { className?: string }) {
  const path = useSyncExternalStore(
    subscribeOpenConversation,
    () => location.pathname,
    () => "/",
  )
  const space = useSpace()
  const stay = (event: MouseEvent) => event.preventDefault()
  return (
    <nav aria-label="Spaces" className={cn("flex items-center rounded-full bg-muted p-0.5", className)}>
      <a
        href={space === "chat" ? path : chatHref()}
        aria-current={space === "chat" ? "page" : undefined}
        className={pill}
        onClick={space === "chat" ? stay : returnChat}
      >
        Chat
      </a>
      <a
        href="/office"
        aria-current={space === "office" ? "page" : undefined}
        className={pill}
        onClick={space === "office" ? stay : (event) => enterSpace(event, "/office")}
      >
        Office
      </a>
    </nav>
  )
}
