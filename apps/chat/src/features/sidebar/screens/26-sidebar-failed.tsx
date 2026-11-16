import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi } from "../sample-api"

const cache = createConversationCache({
  ...sampleApi([]),
  list: async () => {
    throw new Error("Chats unavailable")
  },
})

export default function SidebarFailed() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
