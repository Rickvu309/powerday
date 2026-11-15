import type { ConversationStore } from "@powerday/chat-core"

const notImplemented = (): never => {
  throw new Error("saved conversations are not implemented")
}

export const conversationStore: (env: Cloudflare.Env) => ConversationStore = () => ({
  list: notImplemented,
  get: notImplemented,
  claim: notImplemented,
  save: notImplemented,
})
