import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { expect, test } from "@playwright/test"

const chat = path.join(import.meta.dirname, "../../apps/chat")

const wrangler = (...args: string[]) =>
  execFileSync("pnpm", ["exec", "wrangler", ...args], { cwd: chat, encoding: "utf8", stdio: "pipe" })

const linkMailedTo = (email: string) => {
  const rows = JSON.parse(
    wrangler(
      "d1",
      "execute",
      "power-chat",
      "--local",
      "--json",
      "--command",
      `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
    ),
  ) as [{ results: { text: string }[] }]
  const link = rows[0].results[0]?.text.split("\n").find((line) => line.startsWith("http"))
  if (link === undefined) throw new Error(`no sign-in mail to ${email} in mail_log`)
  return link
}

const chatRequest = {
  id: "c1",
  model: "mock",
  messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
}

test.beforeAll(() => {
  wrangler("d1", "migrations", "apply", "power-chat", "--local")
})

test("a signed-out visitor gets 401 from chat and saved conversations", async ({ request }) => {
  expect((await request.post("/api/chat", { data: chatRequest })).status()).toBe(401)
  expect((await request.get("/api/conversations")).status()).toBe(401)
  expect((await request.get("/api/conversations/c1")).status()).toBe(401)
})

test("a person signs in with the mailed link, with Google hidden until it is configured", async ({ page }) => {
  const email = `ada-${randomBytes(4).toString("hex")}@example.com`
  await page.goto("/")
  const form = page.getByRole("main")
  await expect(form.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
  await expect(form.getByRole("button", { name: "Continue with Google" })).toHaveCount(0)
  await form.getByLabel("Email").fill(email)
  await form.getByRole("button", { name: "Continue with email" }).click()
  await expect(form.getByRole("heading", { name: "Check your email" })).toBeVisible()
  await expect(form).toContainText(email)

  expect((await page.request.post("/api/chat", { data: chatRequest })).status()).toBe(401)
  await page.goto(linkMailedTo(email))
  await expect(page).toHaveURL("/")
  await expect(page.getByRole("button", { name: email })).toBeVisible()
  const session = await page.request.get("/api/auth/get-session")
  expect(await session.json()).toMatchObject({ user: { email } })
  expect((await page.request.post("/api/chat", { data: chatRequest })).status()).not.toBe(401)
  const reused = await page.request.get(linkMailedTo(email), { maxRedirects: 0 })
  expect(reused.headers().location).toContain("error=INVALID_TOKEN")
  await page.getByRole("button", { name: email }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
  expect((await page.request.post("/api/chat", { data: chatRequest })).status()).toBe(401)
})

test("a failed session lookup offers a retry without exposing the composer", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 503, body: "offline" }))
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Couldn't load your account" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0)
  await page.unroute("**/api/auth/get-session")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
})
