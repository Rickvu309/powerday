import { ConversationId, createChatApi, parseCatalog } from "@powerday/chat-core"
import { env, waitUntil } from "cloudflare:workers"
import { auth } from "./auth"
import { conversationStore } from "./conversations"
import { modelGateway } from "./gateway"
import { adminAccess } from "./admin-access"
import { adminStore } from "./admin-store"
import { keyVault } from "./key-vault"
import { usageLedger } from "./usage"

const catalog = parseCatalog(env.CATALOG)
const vault = keyVault(env.PROVIDER_KEYS_SECRET)
const admin = adminStore(env.DB, env.CATALOG, vault, env.USAGE_LIMITS)

export default createChatApi({
  catalog,
  catalogSource: admin,
  adminAccess: adminAccess(env.DB, env.ADMIN_EMAILS, env.ASSETS),
  adminStore: admin,
  store: conversationStore(env),
  ledger: usageLedger(env),
  gateway: modelGateway(env, catalog, admin, vault),
  auth: auth(env),
  clock: { now: () => new Date() },
  ids: { conversation: () => ConversationId.parse(crypto.randomUUID()), message: () => crypto.randomUUID() },
  waitUntil,
})
