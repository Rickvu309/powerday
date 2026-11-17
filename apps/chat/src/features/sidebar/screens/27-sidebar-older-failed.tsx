import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi, sampleConversations } from "../sample-api"

const api = sampleApi(sampleConversations(120))
const cache = createConversationCache({
  ...api,
  list: async (before) => {
    if (before !== undefined) throw new Error("Older chats unavailable")
    return api.list(before)
  },
})

export default function SidebarOlderFailed() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
