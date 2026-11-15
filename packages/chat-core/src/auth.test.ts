import { memoryAdapter } from "better-auth/adapters/memory"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuth, resend, type Auth, type AuthConfig, type Mail } from "./auth.js"

const local = "http://localhost:5173"

const setup = (config: Partial<AuthConfig> = {}, tables = { user: [], session: [], account: [], verification: [] }) => {
  const mails: Mail[] = []
  const auth = createAuth({
    database: memoryAdapter(tables),
    site: "loopback",
    google: undefined,
    allowlist: [],
    send: async (mail) => {
      mails.push(mail)
    },
    ...config,
  })
  return { auth, mails, tables }
}

const requestLink = (auth: Auth, email: string, origin = local) =>
  auth.handle(
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, callbackURL: "/" }),
    }),
  )

const linkIn = (mail: Mail | undefined) => {
  const link = mail?.text.split("\n").find((line) => line.startsWith("http"))
  if (link === undefined) throw new Error("the mail carries no link")
  return link
}

const signedIn = (auth: Auth, opened: Response, origin = local) => {
  const cookie = opened.headers.getSetCookie().map((header) => header.split(";")[0])
  return auth.user(
    new Request(`${origin}/api/chat`, { headers: { host: new URL(origin).host, cookie: cookie.join("; ") } }),
  )
}

afterEach(() => vi.useRealTimers())

describe("createAuth", () => {
  it("signs a person in with the magic link from their mail", async () => {
    const { auth, mails } = setup()
    expect((await requestLink(auth, "ada@example.com")).status).toBe(200)
    expect(mails.map((mail) => mail.to)).toEqual(["ada@example.com"])
    const opened = await auth.handle(new Request(linkIn(mails[0])))
    expect(opened.status).toBe(302)
    expect(opened.headers.get("location")).toBe(`${local}/`)
    expect(await signedIn(auth, opened)).toEqual(expect.any(String))
    expect(await auth.user(new Request(`${local}/api/chat`, { headers: { host: "localhost:5173" } }))).toBeUndefined()
  })

  it("accepts a link once", async () => {
    const { auth, mails } = setup()
    await requestLink(auth, "ada@example.com")
    await auth.handle(new Request(linkIn(mails[0])))
    const again = await auth.handle(new Request(linkIn(mails[0])))
    expect(again.headers.get("location")).toBe(`${local}/?error=INVALID_TOKEN`)
    expect(await signedIn(auth, again)).toBeUndefined()
  })

  it("mails only addresses the allowlist names by email or domain", async () => {
    const { auth, mails } = setup({ allowlist: ["powerday.work", "ada@example.com"] })
    const outside = await requestLink(auth, "eve@example.com")
    expect(outside.status).toBe(403)
    expect((await requestLink(auth, "eve@notpowerday.work")).status).toBe(403)
    expect((await requestLink(auth, "eve@team.powerday.work")).status).toBe(403)
    expect((await requestLink(auth, "Ada@Example.com")).status).toBe(200)
    expect((await requestLink(auth, "bo@powerday.work")).status).toBe(200)
    expect(mails.map((mail) => mail.to)).toEqual(["Ada@Example.com", "bo@powerday.work"])
  })

  it("refuses to create an account the allowlist does not name, whatever the sign-in method", async () => {
    const open = setup()
    await requestLink(open.auth, "eve@example.com")
    const closed = setup({ allowlist: ["powerday.work"] }, open.tables)
    const opened = await closed.auth.handle(new Request(linkIn(open.mails[0])))
    expect(opened.headers.get("location")).toBe(`${local}/?error=failed_to_create_user`)
    expect(await signedIn(closed.auth, opened)).toBeUndefined()
    expect(open.tables.user).toEqual([])
  })

  it("refuses a new session for an existing user removed from the allowlist", async () => {
    const open = setup()
    await requestLink(open.auth, "eve@example.com")
    await open.auth.handle(new Request(linkIn(open.mails[0])))
    await requestLink(open.auth, "eve@example.com")
    const closed = setup({ allowlist: ["powerday.work"] }, open.tables)
    const opened = await closed.auth.handle(new Request(linkIn(open.mails[1])))
    expect(await signedIn(closed.auth, opened)).toBeUndefined()
  })

  it("expires a mailed link after ten minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { auth, mails } = setup()
    await requestLink(auth, "ada@example.com")
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const opened = await auth.handle(new Request(linkIn(mails[0])))
    expect(opened.headers.get("location")).toBe(`${local}/?error=INVALID_TOKEN`)
    expect(await signedIn(auth, opened)).toBeUndefined()
  })

  it("rejects foreign origins and callback URLs without sending mail", async () => {
    const { auth, mails } = setup()
    const response = await auth.handle(
      new Request(`${local}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://outside.example" },
        body: JSON.stringify({ email: "ada@example.com", callbackURL: "https://outside.example" }),
      }),
    )
    expect(response.status).toBe(403)
    expect(mails).toEqual([])
  })

  it("starts Google OAuth with the configured callback and a state cookie", async () => {
    const { auth } = setup({ google: { clientId: "google-client", clientSecret: "test-secret" } })
    const response = await auth.handle(
      new Request(`${local}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: local },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    )
    const body: unknown = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ url: expect.stringContaining("https://accounts.google.com/") })
    expect(JSON.stringify(body)).toContain("client_id=google-client")
    expect(JSON.stringify(body)).toContain(encodeURIComponent(`${local}/api/auth/callback/google`))
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0)
  })

  it("offers Google only when its client is configured", async () => {
    const methods = async (auth: Auth) => (await auth.handle(new Request(`${local}/api/auth/methods`))).json()
    expect(await methods(setup().auth)).toEqual({ methods: ["email"] })
    const google = setup({ google: { clientId: "id", clientSecret: "secret" } })
    expect(await methods(google.auth)).toEqual({ methods: ["email", "google"] })
  })

  it("links to the app URL and sets a secure, same-site, HTTP-only cookie on the live site", async () => {
    const site = { url: "https://chat.example", secret: "a-test-secret-that-is-long-enough-to-pass" }
    const { auth, mails } = setup({ site })
    await requestLink(auth, "ada@example.com", site.url)
    const link = linkIn(mails[0])
    expect(link.startsWith(`${site.url}/api/auth/magic-link/verify?token=`)).toBe(true)
    const opened = await auth.handle(new Request(link))
    const cookie = opened.headers.getSetCookie().find((header) => header.includes("session_token="))
    expect(cookie).toMatch(/^__Secure-/)
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(await signedIn(auth, opened, site.url)).toEqual(expect.any(String))
  })

  it("refuses a request from a host it does not serve", async () => {
    const { auth, mails } = setup()
    await expect(requestLink(auth, "ada@example.com", "https://chat.powerday.work")).rejects.toThrow(
      "not in the allowed hosts",
    )
    expect(mails).toEqual([])
  })
})

describe("resend", () => {
  const mail = { to: "ada@example.com", subject: "Sign in to Power Chat", text: "link" }

  it("posts the mail to Resend with the key", async () => {
    const posts: { url: string; init: RequestInit | undefined }[] = []
    const send = resend({ key: "re_test", from: "Power Chat <sign-in@example.com>" }, async (url, init) => {
      posts.push({ url: String(url), init })
      return Response.json({ id: "1" })
    })
    await send(mail)
    expect(posts).toEqual([
      {
        url: "https://api.resend.com/emails",
        init: {
          method: "POST",
          headers: { authorization: "Bearer re_test", "content-type": "application/json" },
          body: JSON.stringify({
            from: "Power Chat <sign-in@example.com>",
            to: ["ada@example.com"],
            subject: mail.subject,
            text: mail.text,
          }),
        },
      },
    ])
  })

  it("fails when Resend refuses the mail", async () => {
    const send = resend({ key: "re_test", from: "a@example.com" }, async () => new Response("", { status: 422 }))
    await expect(send(mail)).rejects.toThrow("422")
  })
})
