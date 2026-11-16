import { expect, test } from "@playwright/test"
import { settled, withChatFixtures } from "./chat-fixtures"

const screens = [
  "01-empty",
  "02-streaming-reply",
  "03-long-reply",
  "04-reply-error",
  "05-stopped-reply",
  "06-model-menu",
  "07-signed-out-reply",
  "08-unavailable-model",
  "09-over-limit",
]

for (const width of [1280, 375]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const screen of screens) {
      test(`${screen} at ${width} in ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
        await withChatFixtures(page)
        if (screen === "09-over-limit") {
          await page.clock.install({ time: new Date("2030-01-01T12:00:00Z") })
          await page.route("**/api/auth/get-session", (route) =>
            route.fulfill({
              json: { session: { id: "chat-sample" }, user: { id: "person", email: "Preview account" } },
            }),
          )
        }
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.goto(`/screens/${screen}`)
        await settled(page, screen)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        const composer = await page.getByRole("textbox", { name: "Message" }).boundingBox()
        expect(composer?.x).toBeGreaterThanOrEqual(0)
        expect((composer?.x ?? 0) + (composer?.width ?? 0)).toBeLessThanOrEqual(width)
        const path = testInfo.outputPath(`${screen}-${width}-${colorScheme}.png`)
        await page.screenshot({ path })
        await testInfo.attach(`${screen}-${width}-${colorScheme}`, { path, contentType: "image/png" })
        if (screen === "03-long-reply") {
          await page
            .getByRole("log")
            .locator(":scope > div")
            .first()
            .evaluate((element) => {
              element.scrollTop = 0
            })
          await expect(page.getByText("Thought process", { exact: true })).toBeVisible()
          await page.screenshot({ path: testInfo.outputPath(`${screen}-${width}-${colorScheme}-top.png`) })
        }
        expect(errors).toEqual([])
      })
    }
  }
}
