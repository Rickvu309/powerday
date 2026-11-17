import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { auth, cloudflareEmail, pruneRateLimits, rateLimitCleanupBatch } from "./auth"

let platform: PlatformProxy<Cloudflare.Env>

beforeAll(async () => {
  platform = await getPlatformProxy<Cloudflare.Env>({
    configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href),
    persist: false,
    remoteBindings: false,
  })
  const migration = readFileSync(fileURLToPath(new URL("../migrations/0003_auth.sql", import.meta.url).href), "utf8")
  await platform.env.DB.batch(
    (
      migration +
      readFileSync(fileURLToPath(new URL("../migrations/0006_sign_in_codes.sql", import.meta.url).href), "utf8")
    )
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => platform.env.DB.prepare(sql)),
  )
})

afterAll(async () => platform?.dispose())

beforeEach(async () => {
  await platform.env.DB.prepare("DELETE FROM rateLimit").run()
})

test("an invite-only Worker refuses outsiders before logging mail to local D1", async () => {
  const instance = auth({ ...platform.env, LOCAL_AUTH: "true", ALLOWLIST: ["powerday.work", "ada@example.com"] })
  const request = (email: string) =>
    instance.handle(
      new Request("http://localhost:5173/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:5173" },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    )
  expect((await request("eve@example.com")).status).toBe(403)
  expect(await platform.env.DB.prepare("SELECT COUNT(*) AS count FROM mail_log").first("count")).toBe(0)
  expect((await request("ada@example.com")).status).toBe(200)
  const mail = await platform.env.DB.prepare("SELECT mail FROM mail_log").first<string>("mail")
  expect(JSON.parse(mail ?? "null")).toMatchObject({ to: "ada@example.com", from: platform.env.MAIL_FROM })
})

test("Cloudflare delivers magic links without Resend and hides unconfigured Google sign-in", async () => {
  const send = vi
    .fn<(mail: EmailMessage | EmailMessageBuilder) => Promise<EmailSendResult>>()
    .mockResolvedValue({ messageId: "test-mail" })
  const instance = auth({
    ...platform.env,
    BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
    RESEND_API_KEY: "",
    ALLOWLIST: ["denied.example"],
    ALLOWLIST_JSON: '["ada@example.com"]',
    EMAIL: { send },
  })
  expect(await (await instance.handle(new Request("https://chat.powerday.work/api/auth/methods"))).json()).toEqual({
    methods: ["email"],
  })
  const request = (email: string) =>
    instance.handle(
      new Request("https://chat.powerday.work/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.1",
          origin: "https://chat.powerday.work",
        },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    )
  expect((await request("outsider@example.com")).status).toBe(403)
  expect(send).not.toHaveBeenCalled()
  expect((await request("ada@example.com")).status).toBe(200)
  expect(send.mock.calls.map(([mail]) => mail)).toEqual([
    expect.objectContaining({
      from: platform.env.MAIL_FROM,
      to: "ada@example.com",
      subject: expect.stringMatching(/^\d{6} is your Power Chat sign-in code$/),
      html: expect.stringContaining("Sign in to Power Chat"),
      text: expect.stringContaining("https://chat.powerday.work/api/auth/magic-link/verify?"),
    }),
  ])
})

test.each(['{"domain":"example.com"}', "[7]", "not-json"])(
  "rejects malformed allowlist secrets: %s",
  (ALLOWLIST_JSON) => {
    expect(() => auth({ ...platform.env, LOCAL_AUTH: "true", ALLOWLIST_JSON })).toThrow()
  },
)

test("propagates Cloudflare email delivery failures", async () => {
  const send = vi
    .fn<(mail: EmailMessage | EmailMessageBuilder) => Promise<EmailSendResult>>()
    .mockRejectedValue(new Error("Email Service unavailable"))
  await expect(
    cloudflareEmail({ send }, "sign-in@example.com")({ to: "ada@example.com", subject: "Sign in", text: "Link" }),
  ).rejects.toThrow("Email Service unavailable")
})

test("the Cloudflare binding accepts the composed sign-in email", async () => {
  if (!platform.env.EMAIL) throw new Error("missing email binding")
  await expect(
    cloudflareEmail(
      platform.env.EMAIL,
      platform.env.MAIL_FROM,
    )({
      to: "recipient@example.com",
      subject: "Sign in to Power Chat",
      text: "Test sign-in link",
    }),
  ).resolves.toBeUndefined()
})

test.each(["BETTER_AUTH_SECRET", "ALLOWLIST_JSON", "MAIL_FROM", "EMAIL"])(
  "production auth refuses missing %s without sending mail",
  async (missing) => {
    const send = vi.fn<(mail: EmailMessage | EmailMessageBuilder) => Promise<EmailSendResult>>()
    const instance = auth({
      ...platform.env,
      BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
      ALLOWLIST_JSON: "[]",
      EMAIL: { send },
      [missing]: missing === "MAIL_FROM" ? "" : undefined,
    })
    const response = await instance.handle(new Request("https://chat.powerday.work/api/auth/methods"))
    expect(response.status).toBe(503)
    expect(await instance.user(new Request("https://chat.powerday.work/api/conversations"))).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  },
)

test.each([
  { GOOGLE_CLIENT_ID: "test-client" },
  { GOOGLE_CLIENT_SECRET: "test-google-secret" },
  { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-google-secret" },
])("Google sign-in requires both keys: %j", async (google) => {
  const instance = auth({
    ...platform.env,
    LOCAL_AUTH: "true",
    ...google,
  })
  const response = await instance.handle(new Request("http://localhost:5173/api/auth/methods"))
  expect(await response.json()).toEqual({
    methods: google.GOOGLE_CLIENT_ID && google.GOOGLE_CLIENT_SECRET ? ["email", "google"] : ["email"],
  })
})

test("local D1 logs both alternatives and atomically consumes a code across the button and input", async () => {
  const instance = auth({ ...platform.env, LOCAL_AUTH: "true", ALLOWLIST: [] })
  const origin = "http://localhost:5173"
  const email = "code@example.com"
  const issue = () =>
    instance.handle(
      new Request(`${origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email }),
      }),
    )
  const verify = (otp: string) =>
    instance.handle(
      new Request(`${origin}/api/auth/sign-in/email-otp`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email, otp }),
      }),
    )
  const mail = async () => {
    const value = await platform.env.DB.prepare(
      "SELECT mail FROM mail_log WHERE mail ->> '$.to' = ? ORDER BY id DESC LIMIT 1",
    )
      .bind(email)
      .first<string>("mail")
    const parsed = JSON.parse(value ?? "null")
    const code = String(parsed.subject).slice(0, 6)
    const link = String(parsed.text)
      .split("\n")
      .find((line) => line.startsWith("http"))
    if (!link) throw new Error("missing link")
    expect(parsed.html).toContain(code)
    return { code, link }
  }
  expect((await issue()).status).toBe(200)
  const first = await mail()
  expect((await issue()).status).toBe(200)
  const second = await mail()
  expect((await verify(first.code)).status).toBe(400)
  expect(
    await platform.env.DB.prepare("SELECT COUNT(*) AS count FROM verification WHERE identifier = ?")
      .bind(`sign-in-otp-${email}`)
      .first("count"),
  ).toBe(1)
  const stored = await platform.env.DB.prepare("SELECT value FROM verification WHERE identifier = ?")
    .bind(`sign-in-otp-${email}`)
    .first<string>("value")
  expect(stored).not.toContain(second.code)
  const results = await Promise.all([verify(second.code), instance.handle(new Request(second.link))])
  expect(results.filter((response) => response.headers.has("set-cookie"))).toHaveLength(1)
  expect((await verify(second.code)).status).toBe(400)
}, 30_000)

test.each(["send", "verify"])(
  "D1 shares %s limits across auth instances without NODE_ENV",
  async (flow) => {
    vi.stubEnv("NODE_ENV", undefined)
    try {
      const env = {
        ...platform.env,
        LOCAL_AUTH: "false",
        BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
        ALLOWLIST_JSON: '["example.com"]',
        EMAIL: { send: vi.fn().mockResolvedValue({ messageId: "rate-test" }) },
      }
      const origin = env.APP_URL
      const first = auth(env)
      const second = auth(env)
      const limit = flow === "send" ? 5 : 10
      const request = (instance: ReturnType<typeof auth>, attempt: number, ip?: string) => {
        const headers = new Headers({
          "content-type": "application/json",
          origin,
          "x-forwarded-for": `198.51.100.${attempt + 1}`,
          "x-real-ip": `198.51.100.${attempt + 1}`,
        })
        if (ip) headers.set("cf-connecting-ip", ip)
        const compatibility = attempt % 2 === 0
        if (flow === "verify" && compatibility)
          return instance.handle(
            new Request(`${origin}/api/auth/magic-link/verify?email=limit@example.com&token=000000`, { headers }),
          )
        const path =
          flow === "verify"
            ? "sign-in/email-otp"
            : compatibility
              ? "sign-in/magic-link"
              : "email-otp/send-verification-otp"
        return instance.handle(
          new Request(`${origin}/api/auth/${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ email: "limit@example.com", otp: "000000", type: "sign-in" }),
          }),
        )
      }
      for (const ip of ["192.0.2.10"]) {
        for (let attempt = 0; attempt < limit; attempt += 1)
          expect(flow === "send" ? [200] : attempt % 2 === 0 ? [302] : [400, 403]).toContain(
            (await request(first, attempt, ip)).status,
          )
        const refused = await request(second, limit, ip)
        expect(refused.status).toBe(429)
        expect(refused.headers.get("retry-after") ?? refused.headers.get("x-retry-after")).toBeTruthy()
        expect((await request(second, limit + 1, ip)).status).toBe(429)
      }
      expect((await request(second, 0, "192.0.2.11")).status).not.toBe(429)
      expect(await platform.env.DB.prepare("SELECT COUNT(*) FROM rateLimit").first("COUNT(*)")).toBe(2)
    } finally {
      vi.unstubAllEnvs()
    }
  },
  30_000,
)

test("D1 keeps the five-attempt code lock below the endpoint limit", async () => {
  const instance = auth({ ...platform.env, LOCAL_AUTH: "true", ALLOWLIST: [] })
  const origin = "http://localhost:5173"
  const headers = { "content-type": "application/json", origin, "cf-connecting-ip": "192.0.2.30" }
  expect(
    (
      await instance.handle(
        new Request(`${origin}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: "locked@example.com" }),
        }),
      )
    ).status,
  ).toBe(200)
  const mail = await platform.env.DB.prepare(
    "SELECT mail FROM mail_log WHERE mail ->> '$.to' = ? ORDER BY id DESC LIMIT 1",
  )
    .bind("locked@example.com")
    .first<string>("mail")
  const code = String(JSON.parse(mail ?? "null").subject).slice(0, 6)
  const verify = (otp: string) =>
    instance.handle(
      new Request(`${origin}/api/auth/sign-in/email-otp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: "locked@example.com", otp }),
      }),
    )
  for (let attempt = 1; attempt <= 5; attempt += 1)
    expect(await (await verify(code === "000000" ? "111111" : "000000")).json()).toMatchObject({
      attemptsLeft: 5 - attempt,
    })
  expect((await verify(code)).status).toBe(403)
}, 30_000)

test("unknown routes, session reads and untrusted requests never write counters", async () => {
  const instance = auth({
    ...platform.env,
    LOCAL_AUTH: "false",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
    ALLOWLIST_JSON: "[]",
    EMAIL: { send: vi.fn() },
  })
  for (const path of ["sign-in/unknown", "callback/unknown", "get-session"]) {
    const response = await instance.handle(
      new Request(`${platform.env.APP_URL}/api/auth/${path}`, { headers: { "cf-connecting-ip": "192.0.2.1" } }),
    )
    expect(response.status).toBe(path === "get-session" ? 200 : 404)
  }
  for (const ip of [undefined, "", "invalid", "192.0.2.1, 192.0.2.2"]) {
    for (const path of [
      "sign-in/magic-link",
      "email-otp/send-verification-otp",
      "sign-in/email-otp",
      "magic-link/verify",
    ]) {
      const response = await instance.handle(
        new Request(`${platform.env.APP_URL}/api/auth/${path}`, {
          method: path === "magic-link/verify" ? "GET" : "POST",
          headers: ip === undefined ? {} : { "cf-connecting-ip": ip },
        }),
      )
      expect(response.status).toBe(400)
    }
  }
  expect(await platform.env.DB.prepare("SELECT COUNT(*) FROM rateLimit").first("COUNT(*)")).toBe(0)
})

test("scheduled cleanup removes bounded stale counters and preserves active limits", async () => {
  const now = new Date("2026-11-17T00:00:00Z")
  for (let index = 0; index < rateLimitCleanupBatch + 1; index += 1)
    await platform.env.DB.prepare("INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)")
      .bind(`stale-${index}`, `stale-${index}`, now.getTime() - 86_400_000)
      .run()
  await platform.env.DB.prepare("INSERT INTO rateLimit (id, key, count, lastRequest) VALUES ('active', 'active', 5, ?)")
    .bind(now.getTime())
    .run()
  await pruneRateLimits(platform.env.DB, now)
  expect(await platform.env.DB.prepare("SELECT COUNT(*) FROM rateLimit").first("COUNT(*)")).toBe(2)
  await pruneRateLimits(platform.env.DB, now)
  expect(await platform.env.DB.prepare("SELECT key FROM rateLimit").first("key")).toBe("active")
})
