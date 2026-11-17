import { Hono, type MiddlewareHandler } from "hono"
import { AdminMutation, type AdminAccess, type AdminStore, type CatalogSource } from "./admin.js"
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
  readonly catalogSource?: CatalogSource
  readonly adminAccess?: AdminAccess
  readonly adminStore?: AdminStore
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
    const body =
      route.method === "POST" || route.method === "PATCH" ? await c.req.json().catch(() => undefined) : undefined
    const read = await route.read({ params: c.req.param(), query: c.req.query(), body })
    if (!read.ok) return c.json({ error: read.refusal }, 400)
    const resolved =
      deps.catalogSource === undefined || (route.path !== routes.chat.path && route.path !== routes.models.path)
        ? deps
        : { ...deps, catalog: await deps.catalogSource.read() }
    return handle(read.value, { deps: resolved, request: c.req.raw })
  })

export const createChatApi = (deps: ChatDeps): Hono => {
  const app = new Hono()
  const signedIn: MiddlewareHandler = async (c, next) => {
    if ((await deps.auth.user(c.req.raw)) === undefined) return c.json({ error: "signed out" }, 401)
    return next()
  }
  const adminEmail = async (request: Request) => {
    const user = await deps.auth.user(request)
    return user === undefined ? undefined : deps.adminAccess?.email(user)
  }
  app.use("/admin", async (c, next) => ((await adminEmail(c.req.raw)) === undefined ? c.notFound() : next()))
  app.use("/admin/*", async (c, next) => ((await adminEmail(c.req.raw)) === undefined ? c.notFound() : next()))
  app.get("/admin", (c) => {
    c.header("cache-control", "no-store")
    return deps.adminAccess?.page?.(c.req.raw) ?? c.notFound()
  })
  app.get("/api/admin-access", async (c) =>
    c.json({ admin: (await adminEmail(c.req.raw)) !== undefined }, 200, { "cache-control": "no-store" }),
  )
  app.use("/api/admin/*", async (c, next) => {
    if ((await adminEmail(c.req.raw)) === undefined) return c.json({ error: "forbidden" }, 403)
    if (c.req.method !== "GET" && c.req.header("origin") !== new URL(c.req.url).origin)
      return c.json({ error: "origin" }, 403)
    c.header("cache-control", "no-store")
    return next()
  })
  app.get("/api/admin/overview", async (c) => c.json(await deps.adminStore?.overview(deps.clock.now())))
  app.post("/api/admin/mutate", async (c) => {
    const input = AdminMutation.safeParse(await c.req.json().catch(() => undefined))
    if (!input.success) return c.json({ error: "Check the fields and try again." }, 400)
    const actor = await adminEmail(c.req.raw)
    if (actor === undefined || deps.adminStore === undefined) return c.json({ error: "forbidden" }, 403)
    try {
      await deps.adminStore.mutate(input.data, actor, deps.clock.now(), deps.ids.message())
      return c.json({ saved: true })
    } catch {
      return c.json({ error: "Could not save. Check the provider and try again." }, 409)
    }
  })
  app.post(routes.chat.path, signedIn)
  app.use(`${routes.conversations.path}/*`, signedIn)
  mount(app, deps, routes.chat, chat.handle)
  mount(app, deps, routes.models, models.handle)
  mount(app, deps, routes.conversations, conversations.handle)
  mount(app, deps, routes.conversation, conversation.handle)
  mount(app, deps, routes.rename, conversation.rename)
  mount(app, deps, routes.delete, conversation.remove)
  mount(app, deps, routes.auth, auth.handle)
  return app
}
