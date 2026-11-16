import { readFile } from "node:fs/promises"
import { getPlatformProxy, unstable_dev } from "wrangler"
import { expect, it, vi } from "vitest"
import { auth } from "./auth"

it("fails closed in production and runs local D1 links, revocation, redemption races and the Resend adapter", async () => {
  const platform = await getPlatformProxy<Cloudflare.Env>({
    configPath: "apps/chat/wrangler.jsonc",
    persist: false,
    remoteBindings: false,
  })
  const db = platform.env.DB
  const url = "http://localhost:5173"
  const env = { ...platform.env, APP_URL: url, MAIL_FROM: "test@example.com", EMAIL: undefined }
  const make = (overrides: Partial<Cloudflare.Env> = {}) => auth({ ...env, ...overrides })
  const issue = (service: ReturnType<typeof auth>, email = "eve@example.com") =>
    service.handle(
      new Request(`${url}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    )
  const count = () => db.prepare("SELECT count(*) AS n FROM mail_log").first<number>("n")
  const mailed = async () => {
    const row = await db.prepare("SELECT mail FROM mail_log ORDER BY id DESC LIMIT 1").first<string>("mail")
    const mail: unknown = JSON.parse(row ?? "null")
    const text = typeof mail === "object" && mail !== null && "text" in mail ? mail.text : undefined
    const link = typeof text === "string" ? text.split("\n").find((line) => line.startsWith("http")) : undefined
    if (!link) throw new Error("no mailed link")
    return link
  }
  try {
    const migration = await readFile("apps/chat/migrations/0003_auth.sql", "utf8")
    for (const statement of migration.split(";").filter((sql) => sql.trim())) await db.prepare(statement).run()
    for (const config of [
      { BETTER_AUTH_SECRET: "test-secret-with-sufficient-length-for-auth" },
      { RESEND_API_KEY: "re_test" },
      {},
      { LOCAL_AUTH: "true", BETTER_AUTH_SECRET: "test-secret-with-sufficient-length-for-auth" },
    ]) {
      const unavailable = make(config)
      expect((await issue(unavailable)).status).toBe(503)
      expect(await unavailable.user(new Request(`${url}/api/chat`))).toBeUndefined()
      expect(await count()).toBe(0)
    }
    const local = make({ LOCAL_AUTH: "true" })
    expect((await issue(local)).status).toBe(200)
    const link = await mailed()
    const attempts = await Promise.all(Array.from({ length: 12 }, () => local.handle(new Request(link))))
    const winners = attempts.filter((response) =>
      response.headers.getSetCookie().some((cookie) => cookie.includes("session_token=")),
    )
    expect(winners).toHaveLength(1)
    expect(await db.prepare("SELECT count(*) AS n FROM session").first<number>("n")).toBe(1)
    const cookie =
      winners[0]?.headers
        .getSetCookie()
        .map((header) => header.split(";")[0])
        .join("; ") ?? ""
    const request = (path: string) => new Request(`${url}${path}`, { headers: { cookie } })
    expect(await local.user(request("/api/chat"))).toEqual(expect.any(String))
    expect(await (await local.handle(request("/api/auth/get-session"))).json()).toMatchObject({
      user: { email: "eve@example.com" },
    })
    const restricted = make({ LOCAL_AUTH: "true", ALLOWLIST: ["powerday.work"] })
    expect(await restricted.user(request("/api/chat"))).toBeUndefined()
    expect(await (await restricted.handle(request("/api/auth/get-session"))).json()).toBeNull()
    expect((await restricted.handle(request("/api/auth/list-sessions"))).status).toBe(401)

    const before = await count()
    const post = vi.fn<typeof fetch>(async () => Response.json({ id: "test-mail" }))
    vi.stubGlobal("fetch", post)
    const production = make({
      BETTER_AUTH_SECRET: "test-secret-with-sufficient-length-for-auth",
      RESEND_API_KEY: "re_test",
    })
    expect((await issue(production, "ada@example.com")).status).toBe(200)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails")
    expect(await count()).toBe(before)
  } finally {
    vi.unstubAllGlobals()
    await platform.dispose()
  }
}, 30_000)

it("serves unavailable auth and denies private routes in the real production Worker without an auth secret", async () => {
  const worker = await unstable_dev("apps/chat/worker/index.ts", {
    config: "apps/chat/wrangler.jsonc",
    assets: "apps/chat/src",
    local: true,
    persist: false,
    port: 0,
    vars: { LOCAL_AUTH: "false" },
    experimental: { disableExperimentalWarning: true, watch: false },
  })
  try {
    const response = await worker.fetch("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "eve@example.com", callbackURL: "/" }),
    })
    expect(response.status).toBe(503)
    expect(await response.text()).toContain("email delivery")
    expect((await worker.fetch("/api/auth/get-session")).status).toBe(503)
    expect((await worker.fetch("/api/conversations")).status).toBe(401)
  } finally {
    await worker.stop()
  }
}, 30_000)
