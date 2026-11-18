import { enterAdmin, leaveAdmin, returnPath } from "./admin-navigation"
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react"
import { subscribeOpenConversation } from "@/open-conversation"
import { cn } from "cn"

const space =
  "flex h-8 min-w-24 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-(--motion-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm dark:aria-[current=page]:bg-accent"

export function AdminSwitch({ className }: { className?: string }) {
  const path = useSyncExternalStore(
    subscribeOpenConversation,
    () => location.pathname,
    () => "/",
  )
  const active = path.replace(/\/$/, "") === "/admin"
  const stay = (event: MouseEvent) => event.preventDefault()
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let active = true
    void fetch("/api/admin-access")
      .then(async (response) => {
        const result: unknown = await response.json()
        if (active && response.ok && typeof result === "object" && result !== null && "admin" in result)
          setAdmin(result.admin === true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return admin ? (
    <nav aria-label="Spaces" className={cn("flex items-center rounded-full bg-muted p-0.5", className)}>
      <a
        href={active ? returnPath() : path}
        aria-current={active ? undefined : "page"}
        className={space}
        onClick={active ? leaveAdmin : stay}
      >
        Chat
      </a>
      <a
        href="/admin"
        aria-current={active ? "page" : undefined}
        className={space}
        onClick={active ? stay : enterAdmin}
      >
        Admin
      </a>
    </nav>
  ) : null
}
