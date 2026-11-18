import { HouseIcon, SearchIcon, type LucideIcon } from "lucide-react"
import { Account } from "@/features/auth/account"
import { useAdminPage } from "@/features/admin/admin-navigation"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { openConversation, useOpenConversation } from "@/open-conversation"
import { searchFieldId } from "./conversation-list"

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-primary [&_svg]:size-5"
            onClick={onClick}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function NavigationRail() {
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const admin = useAdminPage()
  const open = useOpenConversation()
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
      </nav>
      <Account />
    </div>
  )
}
