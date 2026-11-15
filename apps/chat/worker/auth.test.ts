import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, test } from "vitest"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { auth } from "./auth"

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
  const instance = auth({ ...platform.env, ALLOWLIST: ["powerday.work", "ada@example.com"] })
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
