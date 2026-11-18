import { lazy, Suspense, useContext, useEffect, useRef, type CSSProperties } from "react"
import { MessageCircleDashedIcon } from "lucide-react"
import { SpaceSwitch } from "@/features/chat/space-switch"
import { ComingSoonToast, showComingSoon } from "@/features/toast/coming-soon"
import { Button } from "@/components/ui/button"
import { useAdminPage } from "@/features/admin/admin-navigation"
import { ModelChoice } from "@/features/model-picker/model-choice"
import { ConversationMain } from "@/features/sidebar/conversation-main"
import { NavigationSidebar } from "@/features/sidebar/navigation-sidebar"
import { SignInGate } from "@/features/auth/sign-in-gate"
import { Chat } from "@/features/chat/chat"
import { ConversationList } from "@/features/sidebar/conversation-list"
import { NavigationRail } from "@/features/sidebar/navigation-rail"
import {
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const sidebarSize = { "--sidebar-width": "20.5rem", "--sidebar-width-icon": "3.25rem" } as CSSProperties

let triggerHandoff = false

function HandoffTrigger({ className }: { className?: string }) {
  const { isMobile } = useSidebar()
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!triggerHandoff) return
    triggerHandoff = false
    trigger.current?.focus()
  }, [])
  return (
    <SidebarTrigger
      ref={trigger}
      className={className}
      onClick={() => {
        triggerHandoff = !isMobile
      }}
    />
  )
}

function PanelTrigger() {
  const { isMobile, state } = useSidebar()
  return isMobile || state === "expanded" ? <HandoffTrigger className="text-muted-foreground" /> : null
}

function TemporaryChat() {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Temporary chat"
      className="ml-auto [&_svg]:size-5"
      onClick={() => showComingSoon("Temporary chat")}
    >
      <MessageCircleDashedIcon />
    </Button>
  )
}

function MainTrigger() {
  const { isMobile, state } = useSidebar()
  return isMobile || state === "collapsed" ? <HandoffTrigger /> : null
}

const Admin = lazy(() => import("@/features/admin/admin").then((module) => ({ default: module.Admin })))

export function App() {
  useEffect(() => {
    const keyboard = () => {
      if (document.documentElement.dataset.inputModality !== "keyboard")
        document.documentElement.dataset.inputModality = "keyboard"
    }
    const pointer = () => {
      if (document.documentElement.dataset.inputModality !== "pointer")
        document.documentElement.dataset.inputModality = "pointer"
    }
    document.documentElement.dataset.inputModality = "pointer"
    document.addEventListener("keydown", keyboard, true)
    document.addEventListener("pointerdown", pointer, true)
    return () => {
      document.removeEventListener("keydown", keyboard, true)
      document.removeEventListener("pointerdown", pointer, true)
      delete document.documentElement.dataset.inputModality
    }
  }, [])
  const admin = useAdminPage()
  const wasAdmin = useRef(admin)
  const { reload } = useContext(ModelChoice)
  useEffect(() => {
    if (wasAdmin.current && !admin) {
      void reload()
      document.querySelector<HTMLTextAreaElement>('[aria-label="Message"]')?.focus()
    }
    wasAdmin.current = admin
  }, [admin, reload])
  return (
    <SignInGate>
      <TooltipProvider delay={300}>
        <a
          href="#conversation-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:outline-2 focus:outline-ring"
          onClick={(event) => {
            event.preventDefault()
            document.getElementById("conversation-main")?.focus({ preventScroll: true })
          }}
        >
          Skip to conversation
        </a>
        <SidebarProvider style={sidebarSize}>
          <NavigationSidebar collapsible="icon" className="overflow-hidden">
            <div className="flex size-full min-h-0">
              <NavigationRail />
              <div
                data-panel
                className="flex h-full min-w-0 flex-1 flex-col bg-background text-sidebar-foreground group-data-[collapsible=icon]:invisible"
              >
                <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 pr-3 pl-4">
                  <span className="truncate text-xl font-bold">Power Chat</span>
                  <PanelTrigger />
                </SidebarHeader>
                <SidebarContent>
                  <ConversationList />
                </SidebarContent>
              </div>
            </div>
            <SidebarRail />
          </NavigationSidebar>
          <SidebarInset
            id="conversation-main"
            tabIndex={-1}
            aria-labelledby={admin ? "admin-title" : "conversation-title"}
            className="h-dvh min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <header className="relative flex shrink-0 items-center gap-1 px-2">
              <MainTrigger />
              <SpaceSwitch className="absolute top-[calc(50%+var(--safe-area-top)/2)] left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <TemporaryChat />
            </header>
            <ComingSoonToast />
            {admin ? (
              <div className="overflow-y-auto">
                <Suspense
                  fallback={
                    <p role="status" className="p-8">
                      Loading admin…
                    </p>
                  }
                >
                  <Admin />
                </Suspense>
              </div>
            ) : null}
            <div className={admin ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
              <ConversationMain paused={admin}>
                <Chat paused={admin} />
              </ConversationMain>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </SignInGate>
  )
}
