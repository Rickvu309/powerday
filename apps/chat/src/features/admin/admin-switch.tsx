import { enterAdmin, leaveAdmin, returnPath, useAdminPage } from "./admin-navigation"
import { useEffect, useState } from "react"
import { cn } from "cn"

const space =
  "flex h-8 min-w-24 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-(--motion-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm dark:aria-[current=page]:bg-accent"

export function AdminSwitch({ className }: { className?: string }) {
  const active = useAdminPage()
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
      <a href={returnPath()} aria-current={active ? undefined : "page"} className={space} onClick={leaveAdmin}>
        Chat
      </a>
      <a href="/admin" aria-current={active ? "page" : undefined} className={space} onClick={enterAdmin}>
        Admin
      </a>
    </nav>
  ) : null
}
