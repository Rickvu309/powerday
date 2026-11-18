import { useSyncExternalStore, type MouseEvent } from "react"
import { cn } from "cn"
import { leaveAdmin, returnPath } from "@/features/admin/admin-navigation"
import { showComingSoon } from "@/features/toast/coming-soon"
import { subscribeOpenConversation } from "@/open-conversation"

const space =
  "flex h-8 min-w-[6.75rem] items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-(--motion-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"

export function SpaceSwitch({ className }: { className?: string }) {
  const path = useSyncExternalStore(
    subscribeOpenConversation,
    () => location.pathname,
    () => "/",
  )
  const admin = path.replace(/\/$/, "") === "/admin"
  const stay = (event: MouseEvent) => event.preventDefault()
  return (
    <nav aria-label="Spaces" className={cn("flex items-center rounded-full bg-muted p-0.5", className)}>
      <a
        href={admin ? returnPath() : path}
        aria-current={admin ? undefined : "page"}
        className={space}
        onClick={admin ? leaveAdmin : stay}
      >
        Chat
      </a>
      <button type="button" className={space} onClick={() => showComingSoon("Work")}>
        Work
      </button>
    </nav>
  )
}
