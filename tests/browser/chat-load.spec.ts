import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { clientAddress } from "./client-address"
import { withChatFixtures, replyStream } from "./chat-fixtures"

test.beforeEach(async ({ page }, info) => {
  await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": clientAddress(info.workerIndex) })
})

const mailedLink = (output: string) => {
  const rows: unknown = JSON.parse(output)
  if (!Array.isArray(rows)) throw new Error("Invalid mail rows")
  const result: unknown = rows[0]
  if (typeof result !== "object" || result === null || !("results" in result) || !Array.isArray(result.results))
    throw new Error("Invalid mail result")
  const mail: unknown = result.results[0]
  if (typeof mail !== "object" || mail === null || !("text" in mail) || typeof mail.text !== "string")
    throw new Error("Invalid mail")
  const link = mail.text.split("\n").find((line) => line.startsWith("http"))
  if (link === undefined) throw new Error("Sign-in mail missing")
  return link
}

for (const width of [1280, 390]) {
  test(`cold product JavaScript stays below 200000 bytes at ${width}px`, async ({ browser, baseURL }, info) => {
    if (baseURL === undefined) throw new Error("Missing product origin")
    const auth = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "cf-connecting-ip": `192.0.2.${width === 1280 ? 101 : 102}` },
    })
    const email = `load-${randomUUID()}@example.com`
    expect((await auth.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } })).ok()).toBe(
      true,
    )
    const link = mailedLink(
      execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "power-chat",
          "--local",
          "--json",
          "--command",
          `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
        ],
        { cwd: "apps/chat", encoding: "utf8" },
      ),
    )
    expect((await auth.request.get(link)).ok()).toBe(true)
    expect(await (await auth.request.get("/api/auth/get-session")).json()).toMatchObject({ user: { email } })
    const state = await auth.storageState()
    await auth.close()
    for (const signedIn of [false, true]) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: 900 },
        ...(signedIn ? { storageState: state } : {}),
      })
      const page = await context.newPage()
      const bodies = new Map<string, { url: string; status: number; raw: number; gzip9: number }>()
      const failures: string[] = []
      const pending: Promise<void>[] = []
      page.on("requestfailed", (request) => {
        if (request.resourceType() === "script") failures.push(request.url())
      })
      page.on("response", (response) => {
        if (response.request().resourceType() !== "script" && !new URL(response.url()).pathname.endsWith(".js")) return
        pending.push(
          (async () => {
            try {
              const body = await response.body()
              bodies.set(response.url(), {
                url: response.url(),
                status: response.status(),
                raw: body.length,
                gzip9: gzipSync(body, { level: 9 }).length,
              })
            } catch (error) {
              failures.push(String(error))
            }
          })(),
        )
      })
      await page.goto("/")
      if (signedIn) {
        await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
        await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
        await page.getByRole("textbox", { name: "Message" }).fill("Unsent draft")
      } else await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
      await page.waitForLoadState("networkidle")
      await page.waitForTimeout(1000)
      await Promise.all(pending)
      const manifest = [...bodies.values()]
      const gzip9 = manifest.reduce((sum, body) => sum + body.gzip9, 0)
      const path = info.outputPath(`${signedIn ? "signed-in" : "signed-out"}-js.json`)
      await writeFile(
        path,
        JSON.stringify(
          {
            method: "unique decoded JS bodies recompressed at gzip9; not encoded transfer or latency",
            width,
            signedIn,
            gzip9,
            manifest,
            failures,
          },
          null,
          2,
        ),
      )
      await info.attach(`JavaScript ${signedIn}`, { path, contentType: "application/json" })
      expect(failures).toEqual([])
      expect(manifest.length).toBeGreaterThan(0)
      expect(manifest.every((body) => body.status === 200)).toBe(true)
      expect(manifest.some((body) => /chat-session-|thread-/.test(body.url))).toBe(false)
      expect(gzip9).toBeLessThan(200000)
      await context.close()
    }
  })
}

for (const method of ["Enter", "suggestion"] as const) {
  test(`held session freezes ${method} question and model through promotion`, async ({ page }) => {
    await withChatFixtures(page)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired = false
    await page.route("**/assets/chat-session-*.js", async (route) => {
      acquired = true
      await held
      await route.continue()
    })
    const posts: unknown[] = []
    await page.route("**/api/chat", (route) => {
      posts.push(route.request().postDataJSON())
      return route.fulfill({ contentType: "text/event-stream", body: replyStream("Original answer") })
    })
    await page.goto("/")
    const field = page.getByRole("textbox", { name: "Message" })
    await expect(page.getByRole("button", { name: /Model: Mock Fast/ })).toBeVisible()
    if (method === "Enter") {
      await field.fill("Original question")
      await field.press("Enter")
    } else await page.getByText("Explain a concept", { exact: true }).click()
    await expect.poll(() => acquired).toBe(true)
    await expect(page).toHaveURL(/\/c\//)
    await field.fill("Second draft")
    await field.press("Enter")
    await field.press("Enter")
    await page.getByRole("button", { name: /Model:/ }).click()
    await page.getByRole("menuitemradio", { name: /Mock Reasoning/ }).click()
    expect(posts).toHaveLength(0)
    release()
    await expect(page.locator(".is-assistant")).toContainText("Original answer")
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ model: "mock-fast" })
    await expect(field).toHaveValue("Second draft")
  })
}

test("departure and Back permanently cancel a held first send", async ({ page }) => {
  await withChatFixtures(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let acquired = false
  await page.route("**/assets/chat-session-*.js", async (route) => {
    acquired = true
    await held
    await route.continue()
  })
  const posts: unknown[] = []
  await page.route("**/api/chat", (route) => {
    posts.push(route.request().postDataJSON())
    return route.fulfill({ body: replyStream("Answer"), contentType: "text/event-stream" })
  })
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await field.fill("Cancelled question")
  await field.press("Enter")
  await expect.poll(() => acquired).toBe(true)
  await field.fill("Private follow-up")
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await page.goBack()
  release()
  await expect(page.getByRole("alert")).toContainText("hasn’t been sent")
  await expect(field).toHaveValue("Private follow-up")
  await page.waitForLoadState("networkidle")
  expect(posts).toHaveLength(0)
})

test("failed session load retains the original question through rapid explicit retry", async ({ page }) => {
  await withChatFixtures(page)
  let requests = 0
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/assets/chat-session-*.js", async (route) => {
    requests++
    if (requests === 1) return route.fulfill({ status: 503, body: "Unavailable", contentType: "text/javascript" })
    await held
    return route.continue()
  })
  const posts: unknown[] = []
  await page.route("**/api/chat", (route) => {
    posts.push(route.request().postDataJSON())
    return route.fulfill({ contentType: "text/event-stream", body: replyStream("Recovered answer") })
  })
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model: Mock Fast/ })).toBeVisible()
  await field.fill("Frozen question")
  await field.press("Enter")
  await expect(page.getByRole("alert")).toContainText("hasn’t been sent")
  await field.fill("Newer draft")
  await page.getByRole("button", { name: /Model:/ }).click()
  await page.getByRole("menuitemradio", { name: /Mock Reasoning/ }).click()
  await page.getByRole("button", { name: "Try again", exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  expect(posts).toHaveLength(0)
  await expect(field).toHaveValue("Newer draft")
  release()
  await expect(page.locator(".is-assistant")).toContainText("Recovered answer")
  expect(posts).toHaveLength(1)
  expect(posts[0]).toMatchObject({
    model: "mock-fast",
    message: { parts: [{ type: "text", text: "Frozen question" }] },
  })
  await expect(field).toHaveValue("Newer draft")
})

for (const change of ["signout", "revoke"] as const) {
  test(`real ${change} cancels preparation before account reload`, async ({ page, baseURL }) => {
    const email = `preparing-${randomUUID()}@example.com`
    expect((await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } })).ok()).toBe(
      true,
    )
    const link = mailedLink(
      execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "power-chat",
          "--local",
          "--json",
          "--command",
          `SELECT mail ->> '$.text' AS text FROM mail_log WHERE mail ->> '$.to' = '${email}' ORDER BY id DESC LIMIT 1`,
        ],
        { cwd: "apps/chat", encoding: "utf8" },
      ),
    )
    await page.goto(link)
    await expect(page.getByRole("button", { name: email })).toBeVisible()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired = false
    await page.route("**/assets/chat-session-*.js", async (route) => {
      acquired = true
      await held
      await route.continue().catch(() => {})
    })
    const posts: string[] = []
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") posts.push(request.url())
    })
    const field = page.getByRole("textbox", { name: "Message" })
    await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
    await field.fill("Private frozen question")
    await field.press("Enter")
    await expect.poll(() => acquired).toBe(true)
    await field.fill("Private newer draft")
    if (change === "signout") {
      await page.getByRole("button", { name: email }).click()
      await page.getByRole("menuitem", { name: "Sign out" }).click()
    } else {
      execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "power-chat",
          "--local",
          "--command",
          `DELETE FROM session WHERE userId IN (SELECT id FROM user WHERE email = '${email}')`,
        ],
        { cwd: "apps/chat", encoding: "utf8" },
      )
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    }
    await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
    release()
    await page.waitForLoadState("networkidle")
    expect(posts).toEqual([])
    await expect(page.locator("body")).not.toContainText("Private frozen question")
    await expect(page.locator("body")).not.toContainText("Private newer draft")
    expect(baseURL).toBeDefined()
  })
}

test("deferred rich replies render math and a diagram", async ({ page }) => {
  await withChatFixtures(page)
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: replyStream("A formula:\n\n$$x^2 + y^2 = z^2$$\n\n```mermaid\ngraph TD\n  A[Question] --> B[Answer]\n```"),
    }),
  )
  await page.goto("/")
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  const field = page.getByRole("textbox", { name: "Message" })
  await field.fill("Show math and a diagram")
  await field.press("Enter")
  await expect(page.locator(".katex").first()).toBeVisible()
  await expect(page.locator(".is-assistant svg").filter({ hasText: "Question" }).first()).toBeVisible()
})
