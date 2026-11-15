import { describe, expect, it } from "vitest"
import { createChatApi, type ChatDeps } from "./api.js"
import { listModels, parseCatalog } from "./catalog.js"
import { catalogConfig } from "./catalog.fixture.js"
import { UserId } from "./ids.js"
import { routes } from "./routes.js"

const unused = (): never => {
  throw new Error("a stub route called a port")
}

const deps: ChatDeps = {
  catalog: parseCatalog(catalogConfig),
  store: { list: unused, get: unused, claim: unused, save: unused },
  ledger: { record: unused, spent: unused, allowance: unused },
  gateway: { model: unused },
  auth: {
    user: async () => UserId.parse("ada"),
    handle: async (request) => Response.json({ auth: new URL(request.url).pathname }),
  },
  clock: { now: unused },
  ids: { conversation: unused, message: unused },
  waitUntil: unused,
}

const app = createChatApi(deps)
const signedOut = createChatApi({ ...deps, auth: { ...deps.auth, user: async () => undefined } })

const chatRequest = {
  id: "c1",
  model: "mock-fast",
  message: { id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] },
}

const requestTo = (route: (typeof routes)[keyof typeof routes]) =>
  [
    route.path.replaceAll(":id", "c1").replaceAll("*", "session"),
    route.method === "POST" ? { method: "POST", body: JSON.stringify(chatRequest) } : {},
  ] as const

describe("createChatApi", () => {
  it("lists enabled models and never sends an upstream id", async () => {
    const response = await app.request(routes.models.path)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ models: listModels(deps.catalog) })
    expect(text).not.toContain("upstream")
  })

  it("answers 501 on every route an owner has not built yet", async () => {
    const stubs = Object.values(routes).filter(
      (route) => route !== routes.models && route !== routes.chat && route !== routes.auth,
    )
    for (const route of stubs) {
      expect((await app.request(...requestTo(route))).status, `${route.method} ${route.path}`).toBe(501)
    }
  })

  it("answers 401 to a signed-out visitor on every signed-in route", async () => {
    const answers = await Promise.all(
      Object.values(routes).map(async (route) => [route.path, (await signedOut.request(...requestTo(route))).status]),
    )
    expect(Object.fromEntries(answers)).toEqual({
      "/api/chat": 401,
      "/api/models": 200,
      "/api/conversations": 401,
      "/api/conversations/:id": 401,
      "/api/auth/*": 200,
    })
  })

  it("protects conversation mutations before any route is mounted", async () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      for (const path of ["/api/conversations", "/api/conversations/c1"]) {
        expect((await signedOut.request(path, { method })).status).toBe(401)
      }
    }
  })

  it("hands every auth request to the auth port", async () => {
    const response = await signedOut.request("/api/auth/magic-link/verify?token=t", { method: "GET" })
    expect(await response.json()).toEqual({ auth: "/api/auth/magic-link/verify" })
  })

  it("refuses a chat request whose body is not a chat request", async () => {
    const response = await app.request(routes.chat.path, { method: "POST", body: JSON.stringify({ id: "c1" }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "body" })
  })
})
