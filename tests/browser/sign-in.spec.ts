import { execFileSync, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
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

for (const change of ["switch", "logout", "revoke"] as const) {
  test(`a real ${change} clears the composer after an in-flight focus lookup`, async ({ page, baseURL }) => {
    const email = `ada-${randomBytes(4).toString("hex")}@example.com`
    const issue = async (address: string) => {
      expect(
        (
          await page.request.post("/api/auth/sign-in/magic-link", {
            data: { email: address, callbackURL: "/" },
            headers: { origin: baseURL ?? "" },
          })
        ).status(),
      ).toBe(200)
      return linkMailedTo(address)
    }
    await page.goto(await issue(email))
    await expect(page.getByRole("button", { name: email })).toBeVisible()
    await page.getByRole("textbox", { name: "Message" }).fill("Ada private draft")
    const session = await (await page.request.get("/api/auth/get-session")).json()
    if (change === "revoke") {
      wrangler(
        "d1",
        "execute",
        "power-chat",
        "--local",
        "--command",
        `DELETE FROM session WHERE id = '${session.session.id}'`,
      )
    } else {
      expect(
        (await page.request.post("/api/auth/sign-out", { headers: { origin: baseURL ?? "" }, data: {} })).status(),
      ).toBe(200)
      if (change === "switch") await page.request.get(await issue(`bob-${email}`))
    }
    let release: () => void = () => {}
    let started: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = new Promise<void>((resolve) => {
      started = resolve
    })
    await page.route(
      "**/api/auth/get-session",
      async (route) => {
        const response = await route.fetch()
        started()
        await held
        await route.fulfill({ response })
      },
      { times: 1 },
    )
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await pending
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Ada private draft")
    release()
    if (change === "switch") {
      await expect(page.getByRole("button", { name: `bob-${email}` })).toBeVisible()
      await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("")
    } else {
      await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
      await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0)
      await page.goto(await issue(email))
      await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("")
    }
    await expect(page.locator("body")).not.toContainText("Ada private draft")
  })
}

test("an allowlist change revokes a real browser session and clears its draft on focus", async ({ page, baseURL }) => {
  const email = `eve-${randomBytes(4).toString("hex")}@example.com`
  expect(
    (
      await page.request.post("/api/auth/sign-in/magic-link", {
        headers: { origin: baseURL ?? "" },
        data: { email, callbackURL: "/" },
      })
    ).status(),
  ).toBe(200)
  await page.goto(linkMailedTo(email))
  await expect(page.getByRole("button", { name: email })).toBeVisible()
  await page.getByRole("textbox", { name: "Message" }).fill("Eve private draft")
  const directory = mkdtempSync(path.join(tmpdir(), "powerday-allowlist-"))
  const config = path.join(directory, "wrangler.json")
  const port = Number(new URL(baseURL ?? "").port) + 1000
  writeFileSync(
    config,
    JSON.stringify({
      name: "power-chat",
      main: path.join(chat, "dist/power_chat/index.js"),
      compatibility_date: "2026-11-10",
      vars: {
        LOCAL_AUTH: "true",
        APP_URL: baseURL,
        MAIL_FROM: "test@example.com",
        ALLOWLIST: ["powerday.work"],
        USAGE_LIMITS: { default: { period: "day", tokens: 100000 }, overrides: {} },
        CATALOG: {
          providers: [{ id: "mock", kind: "mock", label: "Mock" }],
          models: [],
        },
      },
      d1_databases: [
        { binding: "DB", database_name: "power-chat", database_id: "ee568fee-a696-44f5-97b4-ec36978233a5" },
      ],
    }),
  )
  const worker = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      config,
      "--persist-to",
      path.join(chat, ".wrangler/state"),
      "--port",
      String(port),
      "--local",
    ],
    { cwd: chat, stdio: "ignore", detached: true },
  )
  const origin = `http://127.0.0.1:${port}`
  try {
    await expect
      .poll(async () => {
        try {
          return (await page.request.get(`${origin}/api/auth/methods`)).status()
        } catch {
          return 0
        }
      })
      .toBe(200)
    const cookie = (await page.context().cookies()).map((entry) => `${entry.name}=${entry.value}`).join("; ")
    expect(await (await page.request.get(`${origin}/api/auth/get-session`, { headers: { cookie } })).json()).toBeNull()
    expect((await page.request.get(`${origin}/api/conversations`, { headers: { cookie } })).status()).toBe(401)
    expect((await page.request.get(`${origin}/api/auth/list-sessions`, { headers: { cookie } })).status()).toBe(401)
    await page.route("**/api/auth/get-session", async (route) => {
      const response = await route.fetch({ url: `${origin}/api/auth/get-session`, headers: { cookie } })
      await route.fulfill({ response })
    })
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0)
    await expect(page.locator("body")).not.toContainText("Eve private draft")
  } finally {
    if (worker.pid !== undefined) process.kill(-worker.pid, "SIGTERM")
    rmSync(directory, { recursive: true, force: true })
  }
})
