import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { ConversationList } from "../conversation-list"
import { sampleApi, sampleConversations } from "../sample-api"

const cache = createConversationCache(sampleApi(sampleConversations(120)))

export default function SidebarSearch() {
  return (
    <ConversationCacheProvider value={cache}>
      <TooltipProvider>
        <SidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarContent>
              <ConversationList initialQuery="phở" />
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="h-dvh">
            <header className="flex h-12 shrink-0 items-center px-2">
              <SidebarTrigger />
            </header>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ConversationCacheProvider>
  )
}
