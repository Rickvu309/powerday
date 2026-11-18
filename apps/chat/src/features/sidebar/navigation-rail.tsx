import { HouseIcon, ImagesIcon, LayoutGridIcon, SearchIcon, ShieldIcon, type LucideIcon } from "lucide-react"
import { useEffect, useState, type MouseEvent } from "react"
import { Account } from "@/features/auth/account"
import { enterAdmin, useAdminPage } from "@/features/admin/admin-navigation"
import { showComingSoon } from "@/features/toast/coming-soon"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { searchFieldId } from "./conversation-list"

const railItem =
  "rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-primary [&_svg]:size-5"

function RailButton({
  label,
  icon: Icon,
  active = false,
  href,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  href?: string
  onClick: (event: MouseEvent) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          href === undefined ? (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={railItem}
              onClick={onClick}
            />
          ) : (
            <a
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), railItem)}
              onClick={onClick}
            />
          )
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function useAdminAccess() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let current = true
    void fetch("/api/admin-access")
      .then(async (response) => {
        const result: unknown = await response.json()
        if (current && response.ok && typeof result === "object" && result !== null && "admin" in result)
          setAdmin(result.admin === true)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])
  return admin
}

export function NavigationRail() {
  const { isMobile, openMobile, setOpen, setOpenMobile } = useSidebar()
  const admin = useAdminPage()
  const open = useOpenConversation()
  const canAdmin = useAdminAccess()
  useEffect(() => {
    if (!admin || !isMobile || openMobile) return
    const focus = () => {
      if (document.querySelector('[data-mobile="true"]')) return
      document.getElementById("admin-title")?.focus()
      observer.disconnect()
    }
    const observer = new MutationObserver(focus)
    observer.observe(document.body, { childList: true, subtree: true })
    focus()
    return () => observer.disconnect()
  }, [admin, isMobile, openMobile])
  return (
    <div
      data-rail
      className="flex h-full w-(--sidebar-width-icon) shrink-0 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar py-2 text-sidebar-foreground"
    >
      <nav aria-label="Rail" className="flex flex-col items-center gap-1">
        <RailButton
          label="Home"
          icon={HouseIcon}
          active={!admin && open === null}
          onClick={() => {
            openConversation(null, { focus: true })
            if (isMobile) setOpenMobile(false)
          }}
        />
        <RailButton
          label="Search chats"
          icon={SearchIcon}
          onClick={() => {
            if (!isMobile) setOpen(true)
            requestAnimationFrame(() => document.getElementById(searchFieldId)?.focus())
          }}
        />
        <RailButton label="Library" icon={ImagesIcon} onClick={() => showComingSoon("Library")} />
        <RailButton label="Apps" icon={LayoutGridIcon} onClick={() => showComingSoon("Apps")} />
        {canAdmin ? (
          <RailButton
            label="Admin"
            icon={ShieldIcon}
            href="/admin"
            active={admin}
            onClick={(event) => {
              enterAdmin(event)
              if (event.defaultPrevented && isMobile) setOpenMobile(false)
            }}
          />
        ) : null}
      </nav>
      <Account />
    </div>
  )
}
