import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi, sampleConversations } from "../sample-api"

const cache = createConversationCache(sampleApi(sampleConversations(120)))

export default function SidebarMany() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
