import { expect, test, type Page } from "@playwright/test"
import { models, replyStream, savedConversation, withChatFixtures } from "./chat-fixtures"

const signedInAs = (page: Page, id: string) =>
  page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { session: { id: `session-${id}` }, user: { id, email: `${id}@powerday.work` } } }),
  )

const signedOut = (page: Page) => page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))

const listed = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => ({
    ...savedConversation.conversation,
    id: `listed-${from + index}`,
    title: `Listed chat ${from + index}`,
    updatedAt: new Date(Date.UTC(2026, 10, 15) - (from + index) * 60_000).toISOString(),
  }))

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
  await withChatFixtures(page)
})

test("failed search retries the current query and announces recovered results", async ({ page }) => {
  let attempts = 0
  let available = false
  await page.route("**/api/conversations?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("q")).toBe("Saved")
    attempts += 1
    return !available
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: { found: [{ conversation: savedConversation.conversation, snippet: "My saved question" }] },
        })
  })
  await page.goto("/")
  await page.getByRole("searchbox", { name: "Search chats" }).fill("Saved")
  const status = page.getByRole("status").filter({ hasText: "Couldn’t search your chats." })
  await expect(status).toHaveCount(1)
  await status.evaluate((element) => element.setAttribute("data-stable-status", "true"))
  const failures = attempts
  available = true
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("searchbox", { name: "Search chats" })).toHaveValue("Saved")
  await expect(page.locator("[data-stable-status]")).toHaveText("1 chat found.")
  await expect(page.getByRole("link", { name: /Saved My saved question/ })).toBeVisible()
  expect(attempts).toBe(failures + 1)
})

test("a failed chat list shows it is loading again and recovers", async ({ page }) => {
  const held = Promise.withResolvers<void>()
  let attempts = 0
  await page.route("**/api/conversations", async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503 })
    await held.promise
    return route.fulfill({ json: { conversations: listed(2) } })
  })
  await page.goto("/")
  await expect(page.getByRole("status").filter({ hasText: "Couldn’t load your chats." })).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.locator("[aria-busy=true]").first()).toBeVisible()
  held.resolve()
  await expect(page.getByRole("link", { name: "Listed chat 1" })).toBeVisible()
  expect(attempts).toBe(2)
})

test("older chats that fail to load can be loaded again", async ({ page }) => {
  let older = 0
  await page.route("**/api/conversations", (route) =>
    route.fulfill({ json: { conversations: listed(50), next: "cursor" } }),
  )
  await page.route("**/api/conversations?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("before")).toBe("cursor")
    older += 1
    return older === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: { conversations: listed(1, 50) } })
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Listed chat 49" }).scrollIntoViewIfNeeded()
  await expect(page.getByRole("status").filter({ hasText: "Couldn’t load older chats." })).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("link", { name: "Listed chat 50" })).toBeVisible()
  await expect(page.getByText("Couldn’t load older chats.")).toHaveCount(0)
  expect(older).toBe(2)
})

test("a chat that fails to open retries and then shows the saved messages", async ({ page }) => {
  let reads = 0
  await page.route("**/api/conversations/saved", (route) => {
    reads += 1
    return reads === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: savedConversation })
  })
  await page.goto("/c/saved")
  await expect(page.getByRole("alert")).toContainText("Couldn’t open this chat. Check your connection and try again.")
  await page.getByRole("alert").getByRole("button", { name: "Retry" }).click()
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
})

test("a missing chat offers a new chat instead of a retry", async ({ page }) => {
  await page.route("**/api/conversations/gone", (route) => route.fulfill({ status: 404, json: { error: "not found" } }))
  await page.goto("/c/gone")
  await expect(page.getByRole("alert")).toContainText("This chat doesn’t exist or was deleted.")
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
  await page.getByRole("alert").getByRole("button", { name: "New chat" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "How can I help you today?" })).toBeVisible()
})

test("an expired session while opening a chat offers sign in and returns to the chat", async ({ page }) => {
  await page.route("**/api/conversations/saved", (route) => route.fulfill({ status: 401 }))
  await page.goto("/c/saved")
  await expect(page.getByRole("alert")).toContainText("Your session expired. Sign in to open this chat.")
  await signedOut(page)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
  await expect(page).toHaveURL(/\/c\/saved$/)
})

test("an expired session on a new chat offers sign in and keeps the question for the same person", async ({ page }) => {
  await page.route("**/api/conversations/*", (route) => route.fulfill({ status: 404, json: { error: "not found" } }))
  await page.route("**/api/chat", (route) => route.fulfill({ status: 401, json: { error: "signed out" } }))
  const links: unknown[] = []
  await page.route("**/api/auth/sign-in/magic-link", (route) => {
    links.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.goto("/")
  const input = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await input.fill("Keep my question")
  await input.press("Enter")
  await expect(page.getByRole("alert")).toContainText(
    "Your session expired. Sign in to continue. Your message will be kept.",
  )
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
  await input.fill("And this follow-up")
  await signedOut(page)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("person@powerday.work")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  expect(links).toEqual([{ email: "person@powerday.work", callbackURL: "/" }])
  await signedInAs(page, "person")
  await page.goto("/")
  await expect(input).toHaveValue("Keep my question\n\nAnd this follow-up")
  await page.reload()
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await expect(input).toHaveValue("Keep my question\n\nAnd this follow-up")
  await page.route("**/api/chat", (route) => route.fulfill({ status: 503 }))
  await input.fill("Revised question with essential details")
  await input.press("Enter")
  await expect(page.getByRole("alert")).toContainText("Something went wrong with this reply.")
  await page.goto("/")
  await expect(input).toHaveValue("Revised question with essential details")
  await page.route("**/api/chat", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: replyStream("Welcome back.") }),
  )
  await input.press("Enter")
  await expect(page.locator(".is-assistant").last()).toContainText("Welcome back.")
  await expect.poll(() => page.evaluate(() => localStorage.getItem("power-chat-kept-draft"))).toBeNull()
  await page.goto("/")
  await expect(input).toHaveValue("")
})

test("blocked browser storage keeps the message available to copy before sign in", async ({ page }) => {
  await page.route("**/api/conversations/*", (route) => route.fulfill({ status: 404 }))
  await page.route("**/api/chat", (route) => route.fulfill({ status: 401 }))
  await page.goto("/")
  const input = page.getByRole("textbox", { name: "Message", exact: true })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await input.fill("Keep this even without storage")
  await input.press("Enter")
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked")
    }
  })
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Message to keep" })).toHaveValue("Keep this even without storage")
  await expect(page.getByText("Couldn’t keep your message in this browser. Copy it before signing in.")).toBeVisible()
  await signedOut(page)
  await page.getByRole("button", { name: "I copied it. Sign in" }).click()
  await expect(page.getByRole("heading", { name: "Sign in to Power Chat" })).toBeVisible()
})

for (const method of ["email", "google"] as const) {
  test(`failed ${method} sign-in can be retried`, async ({ page }) => {
    await signedOut(page)
    await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email", "google"] } }))
    let attempts = 0
    await page.route(`**/api/auth/sign-in/${method === "email" ? "magic-link" : "social"}`, (route) => {
      attempts += 1
      if (attempts === 1) return route.fulfill({ status: 503 })
      return route.fulfill({ json: method === "google" ? { url: "/?signed-in" } : {} })
    })
    await page.goto("/")
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("person@example.com")
    const submit = page.getByRole("button", {
      name: method === "email" ? "Continue with email" : "Continue with Google",
    })
    await submit.click()
    await expect(page.getByRole("alert")).toContainText(
      method === "email" ? "Check your connection and try again." : "Try again.",
    )
    await submit.focus()
    await expect(submit).toBeFocused()
    await submit.press("Enter")
    if (method === "email") await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
    else await expect(page).toHaveURL(/signed-in/)
    expect(attempts).toBe(2)
  })
}

test("a kept question never reaches a different account", async ({ page }) => {
  await page.route("**/api/conversations/*", (route) => route.fulfill({ status: 404, json: { error: "not found" } }))
  await page.route("**/api/chat", (route) => route.fulfill({ status: 401, json: { error: "signed out" } }))
  await page.goto("/")
  const input = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await input.fill("Private question")
  await input.press("Enter")
  await signedInAs(page, "someone-else")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "someone-else@powerday.work" })).toBeVisible()
  await expect(input).toHaveValue("")
  await expect(page.locator("body")).not.toContainText("Private question")
  await signedInAs(page, "person")
  await page.goto("/")
  await expect(input).toHaveValue("Private question")
})

test("an expired session on a saved chat returns to that chat with the follow-up kept", async ({ page }) => {
  await page.route("**/api/conversations/saved", (route) => route.fulfill({ json: savedConversation }))
  let replies = 0
  await page.route("**/api/chat", (route) => {
    replies += 1
    return replies === 1
      ? route.fulfill({ status: 401, json: { error: "signed out" } })
      : route.fulfill({ contentType: "text/event-stream", body: replyStream("Welcome back.") })
  })
  await page.goto("/c/saved")
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  const input = page.getByRole("textbox", { name: "Message" })
  await input.fill("My follow-up")
  await input.press("Enter")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/c\/saved$/)
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await expect(input).toHaveValue("My follow-up")
  await input.press("Enter")
  await expect(page.locator(".is-assistant").last()).toContainText("Welcome back.")
})

test("model catalog retries without losing the editable draft", async ({ page }) => {
  let attempts = 0
  await page.route("**/api/models", (route) => {
    attempts += 1
    return attempts === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: { models } })
  })
  await page.goto("/")
  await expect(page.getByRole("status").filter({ hasText: "Couldn’t load models" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCSS("font-size", "14px")
  const draft = page.getByRole("textbox", { name: "Message" })
  await draft.fill("Keep my draft")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("button", { name: "Model: Mock Fast (Instant)" })).toBeVisible()
  await expect(draft).toHaveValue("Keep my draft")
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled()
  expect(attempts).toBe(2)
})

test("an empty catalog points to the administrator and keeps the draft editable", async ({ page }) => {
  await page.route("**/api/models", (route) => route.fulfill({ json: { models: [] } }))
  await page.goto("/")
  await expect(page.getByText("No models available. Ask your administrator to turn one on.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0)
  await page.getByRole("textbox", { name: "Message" }).fill("Draft for later")
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Draft for later")
})

test("a refused email is selected so an invited address can replace it", async ({ page }) => {
  await signedOut(page)
  await page.route("**/api/auth/sign-in/magic-link", (route) =>
    route.fulfill({ status: route.request().postDataJSON().email === "invited@example.com" ? 200 : 403, json: {} }),
  )
  await page.goto("/")
  const email = page.getByRole("textbox", { name: "Email", exact: true })
  await email.fill("refused@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("alert")).toHaveText(
    "Use an invited email address, or ask your administrator for access.",
  )
  await expect(email).toBeFocused()
  await expect(email).toHaveAttribute("aria-describedby", "sign-in-failure")
  await email.pressSequentially("invited@example.com")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
})

const screens: readonly (readonly [string, string])[] = [
  ["10-models-failed", "Couldn’t load models"],
  ["11-models-empty", "No models available. Ask your administrator to turn one on."],
  ["12-chat-load-failed", "Couldn’t open this chat. Check your connection and try again."],
  ["13-chat-missing", "This chat doesn’t exist or was deleted."],
  ["14-chat-signed-out", "Your session expired. Sign in to open this chat."],
  ["18-draft-storage-failed", "Couldn’t keep your message in this browser. Copy it before signing in."],
  ["25-sidebar-search-failed", "Couldn’t search your chats."],
  ["26-sidebar-failed", "Couldn’t load your chats."],
  ["27-sidebar-older-failed", "Couldn’t load older chats."],
]

for (const width of [1280, 375]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const [screen, message] of screens) {
      test(`${screen} at ${width} in ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 812 })
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
        await page.goto(`/screens/${screen}`)
        if (screen.includes("sidebar") && width === 375) {
          await page.getByRole("button", { name: "Toggle Sidebar" }).click()
          await expect(page.getByRole("dialog")).toHaveCSS("translate", "none")
        }
        if (screen.includes("older")) await page.locator("a[href='/c/sample-49']").scrollIntoViewIfNeeded()
        await expect(page.getByText(message, { exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const path = info.outputPath(`${screen}-${width}-${colorScheme}.png`)
        await page.screenshot({ animations: "disabled", path })
        await info.attach(`${screen}-${width}-${colorScheme}`, { path, contentType: "image/png" })
      })
    }
  }
}
