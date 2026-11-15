import { expect, test } from "@playwright/test"

for (const path of ["/", "/screens/01-empty"]) {
  test(`${path} shows the chat shell with no console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(path)
    await expect(page.getByRole("heading", { name: "How can I help you today?" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible()
    expect(errors).toEqual([])
  })
}
