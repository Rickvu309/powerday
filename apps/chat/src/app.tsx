import { lazy, Suspense, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { MessageCircleDashedIcon } from "lucide-react"
import { SpaceSwitch } from "@/features/chat/space-switch"
import { ComingSoonToast, showComingSoon } from "@/features/toast/coming-soon"
import { Button } from "@/components/ui/button"
import { goSpace, useSpace, type Space } from "@/space-navigation"
import { ModelChoice } from "@/features/model-picker/model-choice"
import { ConversationMain } from "@/features/sidebar/conversation-main"
import { NavigationSidebar } from "@/features/sidebar/navigation-sidebar"
import { SignInGate } from "@/features/auth/sign-in-gate"
import { Chat } from "@/features/chat/chat"
import { ConversationList, PanelSearchTrigger } from "@/features/sidebar/conversation-list"
import { NavigationRail, sidebarHandoff } from "@/features/sidebar/navigation-rail"
import { endPeek, holdPeek, leavePeek, usePeek, type PeekPanel } from "@/features/sidebar/panel-peek"
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

const panelTriggerStyle = "size-8 text-muted-foreground [&_svg]:size-4"

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

function OfficePanel({ trigger, close }: { trigger: ReactNode; close: () => void }) {
  return (
    <Suspense
      fallback={
        <p role="status" aria-busy="true" className="px-4 py-2 text-sm text-muted-foreground">
          Loading office…
        </p>
      }
    >
      <OfficeSidebar trigger={trigger} parts={officeSidebarParts} close={close} />
    </Suspense>
  )
}

function PanelBody({ panel, trigger, close }: { panel: PeekPanel; trigger: ReactNode; close: () => void }) {
  if (panel === "office") return <OfficePanel trigger={trigger} close={close} />
  return (
    <>
      <SidebarHeader className="h-12 flex-row items-center justify-between gap-2 pr-2 pl-4">
        <span className="truncate text-lg font-medium">Power Chat</span>
        <span className="flex items-center gap-1">
          <PanelSearchTrigger />
          {trigger}
        </span>
      </SidebarHeader>
      <SidebarContent>
        <ConversationList />
      </SidebarContent>
    </>
  )
}

function DockedPanel({ panel }: { panel: PeekPanel }) {
  const { isMobile, state, setOpenMobile } = useSidebar()
  if (!isMobile && state === "collapsed") return null
  return (
    <PanelBody
      panel={panel}
      trigger={<HandoffTrigger className={panelTriggerStyle} />}
      close={() => {
        if (isMobile) setOpenMobile(false)
      }}
    />
  )
}

function PeekedPanel() {
  const { isMobile, state } = useSidebar()
  const space = useSpace()
  const peeked = usePeek()
  const inside = useRef(false)
  const shown = isMobile || state === "expanded" ? null : peeked
  useEffect(() => {
    if (isMobile || state === "expanded") endPeek()
  }, [isMobile, state])
  useEffect(() => {
    if (shown === null) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) endPeek()
    }
    const outside = (event: globalThis.PointerEvent) => {
      const held = inside.current || (event.target instanceof Element && event.target.closest("[data-rail]"))
      inside.current = false
      if (!held) endPeek()
    }
    document.addEventListener("keydown", dismiss)
    document.addEventListener("pointerdown", outside)
    return () => {
      document.removeEventListener("keydown", dismiss)
      document.removeEventListener("pointerdown", outside)
    }
  }, [shown])
  if (shown === null) return null
  return (
    <div
      data-peek={shown}
      className="fixed inset-y-0 left-(--sidebar-width-icon) z-20 hidden w-[calc(var(--sidebar-width)-var(--sidebar-width-icon))] py-1.5 pl-1.5 md:flex"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") holdPeek()
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") leavePeek()
      }}
      onPointerDown={() => {
        inside.current = true
      }}
    >
      <div className="flex min-h-0 flex-1 animate-in flex-col overflow-hidden rounded-2xl border border-sidebar-hairline bg-background text-sidebar-foreground shadow-sm duration-150 ease-(--ease-out) fade-in-0 slide-in-from-left-1 motion-reduce:animate-none">
        <PanelBody
          panel={shown}
          trigger={<SidebarTrigger className={panelTriggerStyle} />}
          close={() => {
            if (shown === "office" && space !== "office") goSpace("/office")
          }}
        />
      </div>
    </div>
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
            className="overflow-hidden border-sidebar-hairline group-data-[state=expanded]:border-sidebar-border/40"
          >
            <div className="flex size-full min-h-0">
              <NavigationRail />
              <div
                data-panel
                className="flex h-full min-w-0 flex-1 flex-col bg-background text-sidebar-foreground group-data-[collapsible=icon]:invisible"
              >
                <DockedPanel panel={office ? "office" : "chat"} />
              </div>
            </div>
            <SidebarRail />
          </NavigationSidebar>
          <PeekedPanel />
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
