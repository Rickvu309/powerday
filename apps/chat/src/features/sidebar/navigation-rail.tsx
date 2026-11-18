import {
  createLucideIcon,
  CircleAlertIcon,
  EllipsisIcon,
  HistoryIcon,
  HouseIcon,
  ImagesIcon,
  LayoutGridIcon,
  ShieldIcon,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react"
import { Account } from "@/features/auth/account"
import { enterSpace, returnChat, useSpace } from "@/space-navigation"
import { showComingSoon } from "@/features/toast/coming-soon"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openConversation, useOpenConversation } from "@/open-conversation"

const BriefcaseIcon = createLucideIcon("briefcase-business", [
  ["path", { d: "M12 12h.01", key: "1mp3jc" }],
  ["path", { d: "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2", key: "1ksdt3" }],
  ["path", { d: "M22 13a18.15 18.15 0 0 1-20 0", key: "12hx5q" }],
  ["rect", { width: "20", height: "14", x: "2", y: "6", rx: "2", key: "i6l2r4" }],
])

export const sidebarHandoff = { current: false }

const railItem =
  "rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-primary aria-expanded:bg-transparent hover:aria-expanded:bg-sidebar-accent [&_svg]:size-5"

function RailButton({
  label,
  icon: Icon,
  active = false,
  expanded,
  href,
  onClick,
  buttonRef,
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  expanded?: boolean
  href?: string
  onClick: (event: MouseEvent) => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          href === undefined ? (
            <Button
              ref={buttonRef}
              variant="ghost"
              size="icon-lg"
              aria-label={label}
              aria-current={active ? "page" : undefined}
              aria-expanded={expanded}
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
  const { isMobile, openMobile, state, setOpen, setOpenMobile, toggleSidebar } = useSidebar()
  const space = useSpace()
  const admin = space === "admin"
  const office = space === "office"
  const open = useOpenConversation()
  const canAdmin = useAdminAccess()
  const chatsRef = useRef<HTMLButtonElement>(null)
  const soon = (feature: string) => {
    if (isMobile) setOpenMobile(false)
    showComingSoon(feature)
  }
  useEffect(() => {
    if (!sidebarHandoff.current) return
    sidebarHandoff.current = false
    chatsRef.current?.focus()
  }, [state])
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
      <nav aria-label="Rail" className="flex flex-col items-center gap-3">
        <RailButton
          label="Home"
          icon={HouseIcon}
          active={space === "chat" && open === null}
          onClick={() => {
            openConversation(null, { focus: true })
            if (isMobile) setOpenMobile(false)
          }}
        />
        <RailButton
          label="Office"
          icon={BriefcaseIcon}
          href="/office"
          active={office}
          onClick={(event) => {
            if (office) {
              event.preventDefault()
              if (!isMobile) toggleSidebar()
              return
            }
            enterSpace(event, "/office")
            if (!event.defaultPrevented) return
            if (isMobile) setOpenMobile(false)
            else setOpen(true)
          }}
        />
        <RailButton label="Library" icon={ImagesIcon} onClick={() => soon("Library")} />
        {isMobile ? null : (
          <RailButton
            label="Chats"
            icon={HistoryIcon}
            expanded={state === "expanded" && !office}
            buttonRef={chatsRef}
            onClick={(event) => {
              if (!office) return toggleSidebar()
              returnChat(event)
              setOpen(true)
            }}
          />
        )}
        {canAdmin ? (
          <RailButton
            label="Admin"
            icon={ShieldIcon}
            href="/admin"
            active={admin}
            onClick={(event) => {
              enterSpace(event, "/admin")
              if (event.defaultPrevented && isMobile) setOpenMobile(false)
            }}
          />
        ) : null}
        <RailButton label="More" icon={EllipsisIcon} onClick={() => soon("More")} />
        <div aria-hidden className="h-px w-6 bg-sidebar-border" />
        <RailButton label="Apps" icon={LayoutGridIcon} onClick={() => soon("Apps")} />
      </nav>
      <div className="flex flex-col items-center gap-3">
        <RailButton label="Feedback" icon={CircleAlertIcon} onClick={() => soon("Feedback")} />
        <Account />
      </div>
    </div>
  )
}
