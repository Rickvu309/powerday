import { SignInGate } from "@/features/auth/sign-in"
import { Account } from "@/features/auth/account"
import { Chat } from "@/features/chat/chat"
import { ModelPicker } from "@/features/model-picker/model-picker"
import { ConversationList } from "@/features/sidebar/conversation-list"
import {
  Sidebar,
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
  return (
    <SignInGate>
      <TooltipProvider>
        <SidebarProvider>
          <Sidebar collapsible="icon">
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
          </Sidebar>
          <SidebarInset className="h-dvh">
            <header className="flex h-12 shrink-0 items-center gap-1 px-2">
              <SidebarTrigger />
              <ModelPicker />
            </header>
            <Chat />
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </SignInGate>
  )
}
