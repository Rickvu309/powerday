import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi } from "../sample-api"

const cache = createConversationCache(sampleApi([]))

export default function SidebarEmpty() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
