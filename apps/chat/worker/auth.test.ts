import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { auth, cloudflareEmail } from "./auth"

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
        headers: { "content-type": "application/json", origin: "https://chat.powerday.work" },
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
})
