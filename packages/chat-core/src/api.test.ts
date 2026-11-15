import { describe, expect, it } from "vitest"
import { createChatApi, type ChatDeps } from "./api.js"
import { listModels, parseCatalog } from "./catalog.js"
import { catalogConfig } from "./catalog.fixture.js"
import { routes } from "./routes.js"

const unused = (): never => {
  throw new Error("a stub route called a port")
}

const deps: ChatDeps = {
  catalog: parseCatalog(catalogConfig),
  store: { list: unused, get: unused, save: unused },
  ledger: { record: unused, spent: unused, allowance: unused },
  gateway: { model: unused },
  auth: { user: unused, handle: unused },
  clock: { now: unused },
  ids: { conversation: unused, message: unused },
  waitUntil: unused,
}

const app = createChatApi(deps)

const chatRequest = {
  id: "c1",
  model: "mock-fast",
  message: { id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] },
}

describe("createChatApi", () => {
  it("lists enabled models and never sends an upstream id", async () => {
    const response = await app.request(routes.models.path)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ models: listModels(deps.catalog) })
    expect(text).not.toContain("upstream")
  })

  it("answers 501 on every route an owner has not built yet", async () => {
    const stubs = Object.values(routes).filter((route) => route !== routes.models && route !== routes.chat)
    for (const route of stubs) {
      const path = route.path.replaceAll(":id", "c1").replaceAll("*", "session")
      const init = route.method === "POST" ? { method: "POST", body: JSON.stringify(chatRequest) } : {}
      expect((await app.request(path, init)).status, `${route.method} ${route.path}`).toBe(501)
    }
  })

  it("refuses a chat request whose body is not a chat request", async () => {
    const response = await app.request(routes.chat.path, { method: "POST", body: JSON.stringify({ id: "c1" }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "body" })
  })
})
