import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { UsageLimits } from "../../packages/chat-core/src/usage"

const chat = path.join(import.meta.dirname, "../../apps/chat")
const sql = (command: string) =>
  JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "d1", "execute", "power-chat", "--local", "--json", "--command", command],
      { cwd: chat, encoding: "utf8", stdio: "pipe" },
    ),
  )

const config = JSON.parse(readFileSync(path.join(chat, "wrangler.jsonc"), "utf8").replace(/,(\s*[}\]])/g, "$1"))
const limits = UsageLimits.parse(config.vars.USAGE_LIMITS)

test("a saved reply succeeds, then the cap blocks sending and preserves drafting", async ({ page, baseURL }) => {
  const email = `limit-${randomUUID()}@example.com`
  const issued = await page.request.post("/api/auth/sign-in/magic-link", {
    data: { email, callbackURL: "/" },
    headers: { origin: baseURL ?? "" },
  })
  expect(issued.status()).toBe(200)
  const mail = sql(
    `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
  )
  const link = mail[0].results[0].text.split("\n").find((line: string) => line.startsWith("http"))
  await page.goto(link)
  const session = await (await page.request.get("/api/auth/get-session")).json()
  const user = String(session.user.id).replaceAll("'", "''")
  const field = page.getByRole("textbox", { name: "Message", exact: true })
  await field.fill("Help me plan tomorrow.")
  const success = page.waitForResponse((response) => response.url().endsWith("/api/chat") && response.status() === 200)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await success
  await expect(page.locator(".is-assistant")).toContainText("This is the mock model")
  await expect(page.getByRole("button", { name: "Stop display", exact: true })).toHaveCount(0)
  const saved = await (await page.request.get(`/api/conversations/${page.url().split("/").at(-1)}`)).json()
  expect(saved.messages.at(-1).metadata.reply.state).toBe("complete")
  sql(
    `INSERT INTO usage_events VALUES ('${randomUUID()}', '${user}', 'limit-fixture', 'mock', ${limits.default.tokens}, 0, 0, 0, ${Date.now()})`,
  )
  await field.fill("What should I do first?")
  const blocked = page.waitForResponse((response) => response.url().endsWith("/api/chat") && response.status() === 429)
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const response = await blocked
  expect((await response.json()).resetsAt).toEqual(expect.any(String))
  expect(response.headers()["retry-after"]).toMatch(/^\d+$/)
  await expect(page.getByRole("alert", { name: "Usage limit" })).toContainText("Usage limit reached")
  await expect(page.getByRole("alert")).toContainText("Resets")
  await field.fill("A draft for later")
  await expect(field).toHaveValue("A draft for later")
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Retry message", exact: true })).toBeDisabled()
  const after = await (await page.request.get(`/api/conversations/${page.url().split("/").at(-1)}`)).json()
  expect(after.messages).toEqual(saved.messages)
})

test("the reset re-enables sending without losing the draft", async ({ page }) => {
  const { withChatFixtures } = await import("./chat-fixtures")
  await withChatFixtures(page)
  await page.clock.install({ time: new Date("2030-01-01T23:59:00Z") })
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      json: { error: "usage limit", resetsAt: "2030-01-02T00:00:00.000Z" },
    }),
  )
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message", exact: true })
  await field.fill("A question")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByRole("alert", { name: "Usage limit" })).toBeVisible()
  await field.fill("A draft for later")
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
  await page.clock.fastForward(60_000)
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Retry message", exact: true })).toBeEnabled()
  await expect(page.getByText("Ready to chat again")).toBeVisible()
  await expect(field).toHaveValue("A draft for later")
})
