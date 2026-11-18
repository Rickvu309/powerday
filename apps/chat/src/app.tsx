import { lazy, Suspense, useContext, useEffect, useRef, type CSSProperties } from "react"
import { MessageCircleDashedIcon } from "lucide-react"
import { SpaceSwitch } from "@/features/chat/space-switch"
import { ComingSoonToast, showComingSoon } from "@/features/toast/coming-soon"
import { Button } from "@/components/ui/button"
import { useSpace, type Space } from "@/space-navigation"
import { ModelChoice } from "@/features/model-picker/model-choice"
import { ConversationMain } from "@/features/sidebar/conversation-main"
import { NavigationSidebar } from "@/features/sidebar/navigation-sidebar"
import { SignInGate } from "@/features/auth/sign-in-gate"
import { Chat } from "@/features/chat/chat"
import { ConversationList, PanelSearchTrigger } from "@/features/sidebar/conversation-list"
import { NavigationRail, sidebarHandoff } from "@/features/sidebar/navigation-rail"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const sidebarSize = { "--sidebar-width": "20.5rem", "--sidebar-width-icon": "3.25rem" } as CSSProperties

function HandoffTrigger({ className }: { className?: string }) {
  const { isMobile } = useSidebar()
  return (
    <SidebarTrigger
      className={className}
      onClick={() => {
        sidebarHandoff.current = !isMobile
      }}
    />
  )
}

function PanelTrigger() {
  const { isMobile, state } = useSidebar()
  return isMobile || state === "expanded" ? (
    <HandoffTrigger className="size-8 text-muted-foreground [&_svg]:size-4" />
  ) : null
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
  const { isMobile } = useSidebar()
  return isMobile ? <HandoffTrigger /> : null
}

const Admin = lazy(() => import("@/features/admin/admin").then((module) => ({ default: module.Admin })))
const Office = lazy(() => import("@/features/office/office").then((module) => ({ default: module.Office })))
const OfficeSidebar = lazy(() =>
  import("@/features/office/office-sidebar").then((module) => ({ default: module.OfficeSidebar })),
)

const officeSidebarParts = {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
}

function OfficePanel() {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <Suspense
      fallback={
        <p role="status" aria-busy="true" className="px-4 py-2 text-sm text-muted-foreground">
          Loading office…
        </p>
      }
    >
      <OfficeSidebar
        trigger={<PanelTrigger />}
        parts={officeSidebarParts}
        close={() => {
          if (isMobile) setOpenMobile(false)
        }}
      />
    </Suspense>
  )
}

const spaceHeading: Record<Space, string> = {
  chat: "conversation-title",
  admin: "admin-title",
  office: "office-title",
}

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
  const space = useSpace()
  const admin = space === "admin"
  const office = space === "office"
  const sawAdmin = useRef(false)
  const { reload } = useContext(ModelChoice)
  useEffect(() => {
    if (admin) {
      sawAdmin.current = true
      return
    }
    if (space !== "chat" || !sawAdmin.current) return
    sawAdmin.current = false
    void reload()
    document.querySelector<HTMLTextAreaElement>('[aria-label="Message"]')?.focus()
  }, [space, admin, reload])
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
          <NavigationSidebar
            collapsible="icon"
            className="overflow-hidden group-data-[state=expanded]:border-sidebar-border/40"
          >
            <div className="flex size-full min-h-0">
              <NavigationRail />
              <div
                data-panel
                className="flex h-full min-w-0 flex-1 flex-col bg-background text-sidebar-foreground group-data-[collapsible=icon]:invisible"
              >
                {office ? (
                  <OfficePanel />
                ) : (
                  <>
                    <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 pr-2 pl-4">
                      <span className="truncate text-lg font-medium">Power Chat</span>
                      <span className="flex items-center gap-1">
                        <PanelSearchTrigger />
                        <PanelTrigger />
                      </span>
                    </SidebarHeader>
                    <SidebarContent>
                      <ConversationList />
                    </SidebarContent>
                  </>
                )}
              </div>
            </div>
            <SidebarRail />
          </NavigationSidebar>
          <SidebarInset
            id="conversation-main"
            tabIndex={-1}
            aria-labelledby={spaceHeading[space]}
            className="h-dvh min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <header className="relative flex shrink-0 items-center gap-1 px-2">
              <MainTrigger />
              {office ? null : (
                <SpaceSwitch className="absolute top-[calc(50%+var(--safe-area-top)/2)] left-1/2 -translate-x-1/2 -translate-y-1/2" />
              )}
              {space === "chat" ? <TemporaryChat /> : null}
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
            {office ? (
              <div className="overflow-y-auto">
                <Suspense
                  fallback={
                    <p role="status" aria-busy="true" className="p-8">
                      Loading office…
                    </p>
                  }
                >
                  <Office />
                </Suspense>
              </div>
            ) : null}
            <div className={space === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <ConversationMain paused={space !== "chat"}>
                <Chat paused={space !== "chat"} />
              </ConversationMain>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </SignInGate>
  )
}
