import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useOpenConversation } from "@/open-conversation"
import { ConversationCacheProvider, createConversationCache, useSavedConversation } from "../conversation-cache"
import { ConversationList } from "../conversation-list"
import { sampleApi, sampleConversations } from "../sample-api"

const cache = createConversationCache(sampleApi(sampleConversations(30), 300))

function Thread() {
  const opened = useSavedConversation(useOpenConversation())
  if (opened === undefined) return <p className="text-muted-foreground">Pick a chat.</p>
  if (opened.status === "loading") return <p role="status">Loading chat</p>
  if (opened.status !== "ready") return <p>This chat is gone.</p>
  return (
    <article className="flex flex-col gap-4" data-conversation={opened.saved.conversation.id}>
      {opened.saved.messages.map((message) => (
        <p key={message.id} className={message.role === "user" ? "self-end rounded-2xl bg-muted px-4 py-2" : ""}>
          {message.parts.map((part) => ("text" in part ? part.text : "")).join("")}
        </p>
      ))}
    </article>
  )
}

export default function SidebarSwitching() {
  return (
    <ConversationCacheProvider value={cache}>
      <TooltipProvider>
        <SidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarContent>
              <ConversationList />
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="h-dvh">
            <header className="flex h-12 shrink-0 items-center px-2">
              <SidebarTrigger />
            </header>
            <div className="mx-auto w-full max-w-3xl px-4">
              <Thread />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ConversationCacheProvider>
  )
}
