import { globSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const screens = globSync("*.tsx", { cwd: path.join(import.meta.dirname, "../../apps/chat/src/features/auth/screens") })
  .map((file) => path.basename(file, ".tsx"))
  .sort()

for (const width of [1280, 375]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`sign-in states at ${width} in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 800 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      for (const screen of screens) {
        await page.goto(`/screens/${screen}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
        await page.screenshot({ path: info.outputPath(`${screen}-${width}-${colorScheme}.png`), fullPage: true })
      }
    })
  }
}
