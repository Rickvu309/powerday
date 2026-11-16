import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { UsageLimits } from "../../packages/chat-core/src/usage"
import { withChatFixtures } from "./chat-fixtures"

const chat = path.join(import.meta.dirname, "../../apps/chat")
const sql = (command: string) =>
  JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "d1", "execute", "power-chat", "--local", "--json", "--command", command],
      { cwd: chat, encoding: "utf8", stdio: "pipe" },
    ),
  )[0].results

const config = JSON.parse(readFileSync(path.join(chat, "wrangler.jsonc"), "utf8").replace(/,(\s*[}\]])/g, "$1"))
const limits = UsageLimits.parse(config.vars.USAGE_LIMITS)

test("a reply succeeds and counts, then the cap blocks the next send and keeps the draft", async ({
  page,
  baseURL,
}) => {
  const email = `limit-${randomUUID()}${String.fromCharCode(64)}example.com`
  const issued = await page.request.post("/api/auth/sign-in/magic-link", {
    data: { email, callbackURL: "/" },
    headers: { origin: baseURL ?? "" },
  })
  expect(issued.status()).toBe(200)
  const [mail] = sql(
    `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
  )
  await page.goto(mail.text.split("\n").find((line: string) => line.startsWith("http")))
  const { user } = await (await page.request.get("/api/auth/get-session")).json()
  const field = page.getByRole("textbox", { name: "Message", exact: true })
  const send = page.getByRole("button", { name: "Send", exact: true })
  await field.fill("Help me plan tomorrow.")
  const success = page.waitForResponse((response) => response.url().endsWith("/api/chat"))
  await send.click()
  expect((await success).status()).toBe(200)
  await expect(page.locator(".is-assistant")).toContainText("This is the mock model")
  const conversation = `/api/conversations/${page.url().split("/").at(-1)}`
  await expect
    .poll(async () => (await (await page.request.get(conversation)).json()).messages.at(-1).metadata.reply.state)
    .toBe("complete")
  const saved = await (await page.request.get(conversation)).json()
  const [{ spent }] = sql(
    `SELECT sum(input_tokens + output_tokens) AS spent FROM usage_events WHERE user = '${String(user.id).replaceAll("'", "''")}'`,
  )
  expect(spent).toBeGreaterThan(0)
  sql(
    `INSERT INTO usage_events VALUES ('${randomUUID()}', '${String(user.id).replaceAll("'", "''")}', 'top-up', 'mock', ${Math.max(0, limits.default.tokens - spent)}, 0, 0, 0, ${Date.now()})`,
  )

  await field.fill("What should I do first?")
  const blocked = page.waitForResponse((response) => response.url().endsWith("/api/chat"))
  await send.click()
  const response = await blocked
  expect(response.status()).toBe(429)
  const { resetsAt } = await response.json()
  expect(Date.parse(resetsAt)).toBeGreaterThan(Date.now())
  expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0)
  const alert = page.getByRole("alert")
  await expect(alert).toContainText("You’ve reached your usage limit")
  await expect(alert).toContainText("You can send messages again at")
  await expect(alert.locator("time")).toHaveAttribute("datetime", resetsAt)
  await expect(alert.getByRole("button", { name: "Retry" })).toHaveCount(0)
  await field.fill("A draft for later")
  await expect(field).toHaveValue("A draft for later")
  await expect(send).toBeDisabled()
  expect(await (await page.request.get(conversation)).json()).toEqual(saved)
})

test("the reset re-enables sending without losing the draft", async ({ page }) => {
  await withChatFixtures(page)
  await page.clock.install({ time: new Date("2030-01-01T23:59:00Z") })
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 429, json: { error: "usage limit", resetsAt: "2030-01-02T00:00:00.000Z" } }),
  )
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message", exact: true })
  const send = page.getByRole("button", { name: "Send", exact: true })
  await field.fill("A question")
  await send.click()
  const alert = page.getByRole("alert")
  await expect(alert).toContainText("You’ve reached your usage limit")
  await expect(alert.locator("time")).toHaveAttribute("datetime", "2030-01-02T00:00:00.000Z")
  await field.fill("A draft for later")
  await expect(send).toBeDisabled()
  await page.clock.fastForward(60_000)
  await expect(alert).toContainText("Your usage limit has reset")
  await expect(alert.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
  await expect(send).toBeEnabled()
  await expect(field).toHaveValue("A draft for later")
})

test("a monthly reset names its date", async ({ page }) => {
  await withChatFixtures(page)
  await page.clock.install({ time: new Date("2030-01-10T12:00:00Z") })
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 429, json: { error: "usage limit", resetsAt: "2030-02-01T00:00:00.000Z" } }),
  )
  await page.goto("/")
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("A question")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const shown = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(
    new Date("2030-02-01T00:00:00.000Z"),
  )
  await expect(page.getByRole("alert")).toContainText(`You can send messages again on ${shown} at`)
})
