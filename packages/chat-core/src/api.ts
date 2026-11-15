import { Hono, type MiddlewareHandler } from "hono"
import type { Auth } from "./auth.js"
import type { Catalog } from "./catalog.js"
import type { ConversationStore } from "./conversation.js"
import type { ModelGateway } from "./gateway.js"
import type { Ids } from "./ids.js"
import { routes } from "./routes.js"
import * as auth from "./routes/auth.js"
import * as chat from "./routes/chat.js"
import * as conversation from "./routes/conversation.js"
import * as conversations from "./routes/conversations.js"
import * as models from "./routes/models.js"
import type { UsageLedger } from "./usage.js"
import type { Handler, Route } from "./wire.js"

export type Clock = { readonly now: () => Date }

export type ChatDeps = {
  readonly catalog: Catalog
  readonly store: ConversationStore
  readonly ledger: UsageLedger
  readonly gateway: ModelGateway
  readonly auth: Auth
  readonly clock: Clock
  readonly ids: Ids
  readonly waitUntil: (work: Promise<unknown>) => void
}

const mount = <Value>(app: Hono, deps: ChatDeps, route: Route<Value>, handle: Handler<Value>) =>
  app.on(route.method, route.path, async (c) => {
    const body = route.method === "POST" ? await c.req.json().catch(() => undefined) : undefined
    const read = await route.read({ params: c.req.param(), query: c.req.query(), body })
    if (!read.ok) return c.json({ error: read.refusal }, 400)
    return handle(read.value, { deps, request: c.req.raw })
  })

export const createChatApi = (deps: ChatDeps): Hono => {
  const app = new Hono()
  const signedIn: MiddlewareHandler = async (c, next) => {
    if ((await deps.auth.user(c.req.raw)) === undefined) return c.json({ error: "signed out" }, 401)
    return next()
  }
  app.post(routes.chat.path, signedIn)
  app.use(`${routes.conversations.path}/*`, signedIn)
  mount(app, deps, routes.chat, chat.handle)
  mount(app, deps, routes.models, models.handle)
  mount(app, deps, routes.conversations, conversations.handle)
  mount(app, deps, routes.conversation, conversation.handle)
  mount(app, deps, routes.auth, auth.handle)
  return app
}
