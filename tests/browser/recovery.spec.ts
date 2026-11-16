import { expect, test } from "@playwright/test"
import { models, savedConversation, withChatFixtures } from "./chat-fixtures"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
})

test("failed search retries the current query and announces recovered results", async ({ page }) => {
  await withChatFixtures(page)
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
  await expect(page.getByText("Couldn’t search your chats. Try again.")).toBeVisible()
  const status = page.getByRole("status").filter({ hasText: "Couldn’t search" })
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

test("model catalog retries without losing the editable draft", async ({ page }) => {
  await withChatFixtures(page)
  let attempts = 0
  await page.route("**/api/models", (route) => {
    attempts += 1
    return attempts === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ json: { models } })
  })
  await page.goto("/")
  await expect(page.getByText("Couldn’t load models")).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCSS("font-size", "14px")
  const draft = page.getByRole("textbox", { name: "Message" })
  await draft.fill("Keep my draft")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("button", { name: "Model: Mock Fast" })).toBeVisible()
  await expect(draft).toHaveValue("Keep my draft")
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled()
  expect(attempts).toBe(2)
})

test("an empty catalog gives administrator guidance and keeps the draft editable", async ({ page }) => {
  await withChatFixtures(page)
  await page.route("**/api/models", (route) => route.fulfill({ json: { models: [] } }))
  await page.goto("/")
  await expect(page.getByText("No models are enabled. Contact your administrator.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0)
  await page.getByRole("textbox", { name: "Message" }).fill("Draft for later")
})

test("a refused email is selected so an invited address can replace it", async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }))
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
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

for (const width of [375, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`recovery screens at ${width} in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      await withChatFixtures(page)
      for (const screen of [
        "25-sidebar-search-failed",
        "09-models-failed",
        "10-models-empty",
        "05-sign-in-not-invited",
      ]) {
        await page.goto(`/screens/${screen}`, { waitUntil: "domcontentloaded" })
        if (screen.startsWith("25") && width === 375) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
        const message = screen.startsWith("25")
          ? "Couldn’t search your chats. Try again."
          : screen.startsWith("09")
            ? "Couldn’t load models"
            : screen.startsWith("10")
              ? "No models are enabled. Contact your administrator."
              : "Use an invited email address, or ask your administrator for access."
        await expect(page.getByText(message)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({ path: info.outputPath(`${screen}-${width}-${colorScheme}.png`) })
      }
    })
  }
}
