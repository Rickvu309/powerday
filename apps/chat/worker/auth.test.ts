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
    migration
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
    RESEND_API_KEY: undefined,
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
      subject: "Sign in to Power Chat",
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
