import { globSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"

const screens = globSync("*/screens/*.tsx", { cwd: path.join(import.meta.dirname, "../../apps/chat/src/features") })
  .map((file) => `/screens/${path.basename(file, ".tsx")}`)
  .sort()

const consoleErrors = (page: Page) => {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

test("the shell lays out the sidebar, the empty thread and the composer", async ({ page }) => {
  const errors = consoleErrors(page)
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { user: { id: "ada", email: "ada@example.com" }, session: { id: "session-ada" } } }),
  )
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "How can I help you today?" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible()
  expect(errors).toEqual([])
})

test("every screen file has a page", () => {
  expect(screens).toContain("/screens/01-empty")
})

for (const screen of screens) {
  test(`${screen} renders with no console errors`, async ({ page }) => {
    const errors = consoleErrors(page)
    await page.goto(screen)
    await expect(page.locator("#root")).not.toBeEmpty()
    expect(errors).toEqual([])
  })
}
