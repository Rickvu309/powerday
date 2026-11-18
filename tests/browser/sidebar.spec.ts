import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: { id: "sidebar-sample" },
        user: { id: "sample", email: "sample@powerday.work" },
      },
    }),
  )
})

test("saved chats show grouped by age and the next page loads on scroll", async ({ page }) => {
  await page.goto("/screens/22-sidebar-many")
  const sidebar = page.locator("[data-sidebar=sidebar]")
  for (const age of ["Today", "Yesterday", "Previous 7 days", "Older"]) {
    await expect(sidebar.getByText(age, { exact: true })).toBeVisible()
  }
  const chats = sidebar.locator("a[href^='/c/']")
  await expect(chats).toHaveCount(50)
  await chats.last().scrollIntoViewIfNeeded()
  await expect(chats).toHaveCount(100)
})

test("a chat is renamed and deleted from its menu", async ({ page }) => {
  await page.goto("/screens/22-sidebar-many")
  const first = page.locator("[data-sidebar=sidebar] li").filter({ has: page.locator("a[href='/c/sample-0']") })
  await first.hover()
  await first.getByRole("button", { name: /^Options for/ }).click()
  await page.getByRole("menuitem", { name: "Rename" }).click()
  await page.getByRole("textbox", { name: "Chat title" }).fill("Đà Lạt trip")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("link", { name: "Đà Lạt trip" })).toBeVisible()

  await page.getByRole("button", { name: "Options for Đà Lạt trip" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("link", { name: "Đà Lạt trip" })).toHaveCount(0)
})

test("search shows matching chats and clears with Escape", async ({ page }) => {
  await page.goto("/screens/22-sidebar-many")
  const search = page.getByRole("searchbox", { name: "Search chats" })
  await page.locator('[data-slot="sidebar-content"]').getByRole("button", { name: "Search chats" }).click()
  await search.fill("phở")
  await expect(page.getByText("Results", { exact: true })).toBeVisible()
  await expect(page.locator("a[href^='/c/']").first()).toContainText("Write a phở recipe for six people")
  await search.fill("zzz")
  await expect(page.getByText("No chats match “zzz”.")).toBeVisible()
  await search.press("Escape")
  await expect(page.getByText("Today", { exact: true })).toBeVisible()
})

test("switching back to a loaded chat shows it within 100 ms with no loading state", async ({ page }) => {
  await page.goto("/screens/23-sidebar-switching")
  for (const id of ["sample-1", "sample-2"]) {
    await page.locator(`a[href='/c/${id}']`).click()
    await expect(page.locator(`[data-conversation='${id}']`)).toBeVisible()
  }
  const switches = await page.evaluate(async () => {
    const results: { ms: number; loading: boolean }[] = []
    for (const id of ["sample-1", "sample-2", "sample-1", "sample-2", "sample-1", "sample-2"]) {
      let loading = false
      const observer = new MutationObserver(() => {
        loading ||= document.querySelector("[role=status]") !== null
      })
      observer.observe(document.body, { childList: true, subtree: true })
      const shown = new Promise<number>((resolve) => {
        const check = () =>
          document.querySelector(`[data-conversation='${id}']`)
            ? resolve(performance.now())
            : requestAnimationFrame(check)
        check()
      })
      const started = performance.now()
      document.querySelector<HTMLAnchorElement>(`a[href='/c/${id}']`)!.click()
      results.push({ ms: (await shown) - started, loading })
      observer.disconnect()
    }
    return results
  })
  console.info(`switch to a loaded chat: ${switches.map(({ ms }) => ms.toFixed(1)).join(", ")} ms`)
  expect(switches.filter(({ loading }) => loading)).toEqual([])
  expect(Math.max(...switches.map(({ ms }) => ms))).toBeLessThan(100)
})

test("on a phone the sidebar is a sheet that closes when a chat opens", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/screens/22-sidebar-many")
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByRole("searchbox", { name: "Search chats" })).toBeVisible()
  await sheet.locator("a[href='/c/sample-3']").click()
  await expect(page).toHaveURL(/\/c\/sample-3$/)
  await expect(sheet).toBeHidden()
})

test("the desktop sidebar collapses and new chat clears the URL", async ({ page }) => {
  await page.goto("/screens/23-sidebar-switching")
  await page.locator("a[href='/c/sample-1']").click()
  await expect(page.locator("[data-conversation='sample-1']")).toBeVisible()
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("Pick a chat.")).toBeVisible()
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await expect(page.locator("[data-state=collapsed][data-collapsible=icon]")).toBeVisible()
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.locator('[data-slot="sidebar-content"]').getByRole("button", { name: "Search chats" }).click()
  await expect(page.getByRole("searchbox", { name: "Search chats" })).toBeVisible()
})

for (const width of [1280, 375]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const state of ["empty", "many", "search"]) {
      test(`${state} at ${width} in ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 812 })
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
        await page.goto(
          `/screens/${state === "empty" ? "20-sidebar-empty" : state === "many" ? "22-sidebar-many" : "24-sidebar-search"}`,
        )
        if (width === 375) {
          await page.getByRole("button", { name: "Toggle Sidebar" }).click()
          await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1")
          await expect(page.getByRole("dialog")).toHaveCSS("translate", "none")
        }
        if (state === "empty") await expect(page.getByText("Your chats will show here.")).toBeVisible()
        else await expect(page.locator("a[href^='/c/']").first()).toBeVisible()
        if (width === 1280 && state !== "search")
          await page.locator('[data-slot="sidebar-content"]').getByRole("button", { name: "Search chats" }).click()
        await expect(page.getByRole("searchbox", { name: "Search chats" })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ animations: "disabled", path: info.outputPath(`${state}-${width}-${colorScheme}.png`) })
      })
    }
  }
}
