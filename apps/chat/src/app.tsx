import { useEffect } from "react"
import { NavigationSidebar } from "@/features/sidebar/navigation-sidebar"
import { ConversationMain } from "@/features/sidebar/conversation-main"
import { SignInGate } from "@/features/auth/sign-in"
import { Account } from "@/features/auth/account"
import { Chat } from "@/features/chat/chat"
import { ModelPicker } from "@/features/model-picker/model-picker"
import { ConversationList } from "@/features/sidebar/conversation-list"
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

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
        <SidebarProvider>
          <NavigationSidebar collapsible="icon">
            <SidebarHeader>
              <span className="truncate px-2 py-1 font-semibold group-data-[collapsible=icon]:hidden">Power Chat</span>
            </SidebarHeader>
            <SidebarContent>
              <ConversationList />
            </SidebarContent>
            <SidebarFooter>
              <Account />
            </SidebarFooter>
            <SidebarRail />
          </NavigationSidebar>
          <SidebarInset
            id="conversation-main"
            tabIndex={-1}
            aria-labelledby="conversation-title"
            className="h-dvh min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <header className="flex h-12 shrink-0 items-center gap-1 px-2">
              <SidebarTrigger />
              <ModelPicker />
            </header>
            <ConversationMain>
              <Chat />
            </ConversationMain>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </SignInGate>
  )
}
