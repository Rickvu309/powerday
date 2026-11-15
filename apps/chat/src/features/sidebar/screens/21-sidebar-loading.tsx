import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi } from "../sample-api"

const cache = createConversationCache(sampleApi([], 2 ** 31 - 1))

export default function SidebarLoading() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
