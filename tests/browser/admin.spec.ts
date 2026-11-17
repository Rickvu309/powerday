import { execFileSync } from "node:child_process"
import { expect, test, type Page } from "@playwright/test"

const signIn = async (page: Page, email: string) => {
  expect((await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } })).ok()).toBe(
    true,
  )
  const rows: unknown = JSON.parse(
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
  if (!Array.isArray(rows)) throw new Error("Invalid mail result")
  const result: unknown = rows[0]
  if (typeof result !== "object" || result === null || !("results" in result) || !Array.isArray(result.results))
    throw new Error("Invalid mail rows")
  const mail: unknown = result.results[0]
  if (typeof mail !== "object" || mail === null || !("text" in mail) || typeof mail.text !== "string")
    throw new Error("Invalid mail")
  const link = mail.text.split("\n").find((line) => line.startsWith("http"))
  if (link === undefined) throw new Error("Sign-in link missing")
  await page.goto(link)
  await expect(page.getByRole("button", { name: email })).toBeVisible()
}

test("only admins can open the page, API and sidebar link", async ({ page }) => {
  expect((await page.request.get("/admin")).status()).toBe(404)
  expect((await page.request.get("/api/admin/overview")).status()).toBe(403)
  await signIn(page, "visitor@example.com")
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0)
  expect((await page.request.get("/admin")).status()).toBe(404)
  expect((await page.request.get("/api/admin/overview")).status()).toBe(403)
})

test("an admin manages write-only keys, model availability and email limits", async ({ page }) => {
  test.setTimeout(90000)
  await signIn(page, "admin@example.com")
  expect((await page.request.get("/admin")).status()).toBe(200)
  const message = page.getByRole("textbox", { name: "Message", exact: true })
  await message.fill("Admin chat proof")
  await message.press("Enter")
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator(".is-assistant")).toContainText("This is the mock model")
  await expect(page.getByRole("link", { name: "Admin chat proof", exact: true }).first()).toBeVisible()
  const chatURL = page.url()
  await message.fill("Keep this admin draft")
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Back to chat", exact: true }).click()
  await expect(page).toHaveURL(chatURL)
  await expect(message).toHaveValue("Keep this admin draft")
  await expect(page.locator(".is-assistant")).toContainText("This is the mock model")
  await expect(page.getByRole("link", { name: "Admin chat proof", exact: true }).first()).toBeVisible()
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  await page.getByRole("button", { name: "Add provider", exact: true }).click()
  await page.getByLabel("Provider id", { exact: true }).fill("admin-test")
  await page.getByLabel("Provider label", { exact: true }).fill("Test provider")
  const key = page.getByLabel("API key (optional)", { exact: true })
  await expect(key).toHaveAttribute("type", "password")
  await key.fill("browser-provider-key-abcd")
  await page.route("**/api/admin/mutate", (route) => route.fulfill({ status: 500, json: { error: "offline" } }), {
    times: 1,
  })
  await page.getByRole("button", { name: "Save provider", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Could not save")
  await expect(key).toHaveValue("browser-provider-key-abcd")
  await page.getByRole("button", { name: "Save provider", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Key saved")
  await expect(key).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Edit Test provider provider", exact: true })).toBeFocused()
  expect(await (await page.request.get("/api/admin/overview")).text()).not.toContain("browser-provider-key-abcd")
  await page.getByRole("button", { name: "Edit Test provider provider", exact: true }).click()
  await expect(page.getByLabel("Replace API key (optional)")).toBeEmpty()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit Test provider provider", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Edit Test provider provider", exact: true }).click()
  await page.getByLabel("Replace API key (optional)").fill("browser-replacement-key-efgh")
  await page.getByRole("button", { name: "Save provider", exact: true }).click()
  await expect(page.getByText("…efgh", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Edit Test provider provider", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Add model", exact: true }).click()
  await page.getByLabel("Model id", { exact: true }).fill("admin-test-model")
  await page.getByLabel("Model label", { exact: true }).fill("Test model")
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("admin-test")
  await page.getByLabel("Upstream model id", { exact: true }).fill("upstream-test-model")
  await page.getByRole("button", { name: "Save model", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit Test model model", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Edit Test model model", exact: true }).click()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit Test model model", exact: true })).toBeFocused()
  await expect(page.getByRole("button", { name: "Disable Test model", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Disable Test model", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Existing chats keep their history.")
  expect(await (await page.request.get("/api/models")).text()).toContain("admin-test-model")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Edit Test model model", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Disable Test model", exact: true }).click()
  await dialog.getByRole("button", { name: "Disable model", exact: true }).click()
  await expect(page.getByRole("button", { name: "Enable Test model", exact: true })).toBeVisible()
  expect(await (await page.request.get("/api/models")).text()).not.toContain("admin-test-model")
  await page.getByRole("button", { name: "Edit Test model model", exact: true }).click()
  await page.getByLabel("Model label", { exact: true }).fill("Renamed model")
  await page.getByLabel("Enable model for chat").check()
  await page.getByRole("button", { name: "Save model", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit Renamed model model", exact: true })).toBeFocused()
  await expect(dialog).toHaveCount(0)
  expect(await (await page.request.get("/api/models")).text()).toContain("Renamed model")
  await page.getByRole("button", { name: "Edit Renamed model model", exact: true }).click()
  await page.getByLabel("Enable model for chat").uncheck()
  await page.getByRole("button", { name: "Save model", exact: true }).click()
  await expect(dialog).toContainText("People won't be able to pick Renamed model for new messages.")
  expect(await (await page.request.get("/api/models")).text()).toContain("Renamed model")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByLabel("Enable model for chat")).not.toBeChecked()
  await page.getByRole("button", { name: "Save model", exact: true }).click()
  await dialog.getByRole("button", { name: "Disable model", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit Renamed model model", exact: true })).toBeFocused()
  await expect(page.getByRole("button", { name: "Save model", exact: true })).toHaveCount(0)
  expect(await (await page.request.get("/api/models")).text()).not.toContain("admin-test-model")
  await page.getByLabel("Default daily tokens").fill("150000")
  await page.getByRole("button", { name: "Save default", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Current default: 150,000 tokens")).toBeVisible()
  await expect(page.getByRole("button", { name: "Save default", exact: true })).toBeFocused()
  await page.getByLabel("Override email").fill("limited@example.com")
  await page.getByLabel("Daily tokens", { exact: true }).fill("2500")
  await page.getByRole("button", { name: "Save override", exact: true }).click()
  await expect(page.getByText("limited@example.com", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Save override", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Use default", exact: true }).click()
  await expect(page.getByText("limited@example.com", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Save override", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Delete Test provider provider", exact: true }).click()
  await expect(page.getByRole("dialog")).toContainText("all its models")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Delete Test provider provider", exact: true }).click()
  await page.route("**/api/admin/mutate", (route) => route.fulfill({ status: 500, json: { error: "offline" } }), {
    times: 1,
  })
  await page.getByRole("button", { name: "Delete provider", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Could not save")
  await expect(dialog.getByRole("alert")).toBeFocused()
  await expect(dialog.getByRole("button", { name: "Try again", exact: true })).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab")
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await dialog.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Test provider", exact: true })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Renamed model", exact: true })).toHaveCount(0)
  await page.getByLabel("Override email").fill("admin@example.com")
  await page.getByLabel("Daily tokens", { exact: true }).fill("0")
  await page.getByRole("button", { name: "Save override", exact: true }).click()
  await expect(page.getByRole("button", { name: "Use default", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Back to chat", exact: true }).click()
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled()
  const blocked = page.waitForResponse((response) => response.url().endsWith("/api/chat") && response.status() === 429)
  await message.press("Enter")
  await blocked
  await expect(page.getByRole("alert")).toContainText("limit")
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  await page.getByRole("button", { name: "Use default", exact: true }).click()
  await expect(page.getByRole("button", { name: "Use default", exact: true })).toHaveCount(0)
})

for (const width of [320, 1280])
  for (const colorScheme of ["light", "dark"] as const) {
    test(`admin states fit ${width}px in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      for (const state of [
        "40-admin-empty",
        "41-admin-loading",
        "42-admin-error",
        "43-admin-saving",
        "44-admin-key-saved",
        "45-admin-delete-confirmation",
        "46-admin-ready",
        "47-admin-saved",
        "48-admin-provider-form",
        "49-admin-model-form",
        "50-admin-disable-confirmation",
        "51-admin-delete-error",
      ]) {
        await page.goto(`/screens/${state}`)
        await expect(
          page.getByRole("heading", {
            name:
              state === "45-admin-delete-confirmation" || state === "51-admin-delete-error"
                ? "Delete OpenAI?"
                : state === "50-admin-disable-confirmation"
                  ? "Disable Sample model?"
                  : "Admin",
            exact: true,
          }),
        ).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        await page.screenshot({ path: info.outputPath(`${state}.png`), fullPage: true })
      }
      expect(errors).toEqual([])
    })
  }

for (const width of [320, 375]) {
  test(`long admin edit labels wrap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const [state, label] of [
      ["48-admin-provider-form", "A".repeat(116)],
      ["49-admin-model-form", "B".repeat(116)],
    ]) {
      await page.goto(`/screens/${state}`)
      await expect(page.getByRole("heading", { name: `Edit ${label}`, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      expect(
        await page
          .locator("form")
          .first()
          .evaluate((form) => form.scrollWidth <= form.clientWidth),
      ).toBe(true)
    }
  })
}

test("mobile Admin navigation closes the sidebar before focusing the heading", async ({ page }) => {
  await signIn(page, "admin@example.com")
  await page.setViewportSize({ width: 375, height: 900 })
  await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Back to chat", exact: true })).toBeFocused()
})
