import { ConversationId, createChatApi, parseCatalog } from "@powerday/chat-core"
import { env, waitUntil } from "cloudflare:workers"
import { auth } from "./auth"
import { conversationStore } from "./conversations"
import { modelGateway } from "./gateway"
import { usageLedger } from "./usage"

const catalog = parseCatalog(env.CATALOG)

export default createChatApi({
  catalog,
  store: conversationStore(env),
  ledger: usageLedger(env),
  gateway: modelGateway(env, catalog),
  auth: auth(env),
  clock: { now: () => new Date() },
  ids: { conversation: () => ConversationId.parse(crypto.randomUUID()), message: () => crypto.randomUUID() },
  waitUntil,
})
