import { App } from "@/app"
import { ConversationCacheProvider, createConversationCache } from "../conversation-cache"
import { sampleApi, sampleConversations } from "../sample-api"

const titles = [
  "Plan the international research release with Vietnamese and Arabic documentation, accessibility review, regional rollout and final stakeholder approval — compare the revised launch checklist for Novem",
  "J",
  "Kế hoạch ra mắt sản phẩm — kiểm tra khả năng truy cập và bản dịch tiếng Việt",
  "خطة إصدار المنتج ومراجعة إمكانية الوصول والترجمة",
]
const saved = sampleConversations(4).map((saved, index) => ({
  ...saved,
  conversation: { ...saved.conversation, title: titles[index] ?? saved.conversation.title },
}))
const cache = createConversationCache(sampleApi(saved))

export default function LongChatTitles() {
  return (
    <ConversationCacheProvider value={cache}>
      <App />
    </ConversationCacheProvider>
  )
}
