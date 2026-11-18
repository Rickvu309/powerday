import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { withChatFixtures } from "./chat-fixtures"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/methods", (route) => route.fulfill({ json: { methods: ["email"] } }))
})

const measure = (control: Locator) =>
  control.evaluate((element) => {
    const rgba = (color: string) => {
      const context = document.createElement("canvas").getContext("2d")
      if (context === null) throw new Error("Missing color context")
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const over = (top: number[], below: number[]) =>
      top.slice(0, 3).map((channel, index) => channel * (top[3] / 255) + below[index] * (1 - top[3] / 255))
    const surface = (node: Element | null): number[] =>
      node === null ? [255, 255, 255] : over(rgba(getComputedStyle(node).backgroundColor), surface(node.parentElement))
    const luminance = (color: number[]) =>
      color
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
    const contrast = (a: number[], b: number[]) =>
      Math.round(
        ((Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)) * 100,
      ) / 100
    const style = getComputedStyle(element)
    const inside = surface(element)
    const outside = surface(element.parentElement)
    const border = over(rgba(style.borderTopColor), inside)
    const ring = over(rgba(style.outlineColor), inside)
    const offset = Number.parseFloat(style.outlineOffset)
    return {
      line: `${style.borderTopWidth} ${style.borderTopStyle}`,
      borderInside: contrast(border, inside),
      borderOutside: contrast(border, outside),
      outline: `${style.outlineWidth} ${style.outlineStyle}`,
      outlineOffset: style.outlineOffset,
      outlineAgainst: contrast(ring, offset < 0 ? inside : outside),
      outlineColor: style.outlineColor,
    }
  })

async function expectBoundary(control: Locator, name: string, info: TestInfo) {
  await expect(control).toBeVisible()
  const measured = await measure(control)
  info.annotations.push({
    type: "boundary",
    description: `${name}: ${measured.borderInside} / ${measured.borderOutside}`,
  })
  expect.soft(measured.line, name).toBe("1px solid")
  expect.soft(measured.borderInside, `${name} against its fill`).toBeGreaterThanOrEqual(3)
  expect.soft(measured.borderOutside, `${name} against its surface`).toBeGreaterThanOrEqual(3)
}

async function expectRing(control: Locator, name: string, info: TestInfo, offset = "2px") {
  await expect(control).toBeVisible()
  const ring = await control
    .page()
    .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ring"))
  const expected = await control.page().evaluate((color) => {
    const probe = document.createElement("i")
    probe.style.color = color
    document.body.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  }, ring.trim())
  const measured = await measure(control)
  info.annotations.push({ type: "focus", description: `${name}: ${measured.outlineAgainst}` })
  expect.soft(measured.outline, name).toBe("2px solid")
  expect.soft(measured.outlineOffset, name).toBe(offset)
  expect.soft(measured.outlineColor, `${name} uses --ring`).toBe(expected)
  expect.soft(measured.outlineAgainst, `${name} ring against what it crosses`).toBeGreaterThanOrEqual(3)
}

async function focusByKeyboard(control: Locator) {
  await control.page().keyboard.press("Tab")
  await control.focus()
}

async function motionDuring(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const seen: string[] = []
    const watch = () => {
      for (const animation of document.getAnimations()) {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
        const slot = target?.closest("[data-slot]")?.getAttribute("data-slot") ?? "none"
        const name =
          animation instanceof CSSTransition
            ? animation.transitionProperty
            : animation instanceof CSSAnimation
              ? animation.animationName
              : "script"
        seen.push(`${slot} ${name}`)
      }
      if ("controlMotion" in window) requestAnimationFrame(watch)
    }
    Object.assign(window, { controlMotion: seen })
    watch()
  })
  await act()
  return page.evaluate(() => {
    const seen = "controlMotion" in window ? window.controlMotion : []
    Reflect.deleteProperty(window, "controlMotion")
    return [...new Set(Array.isArray(seen) ? seen : [])]
  })
}

for (const width of [375, 1280]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`text inputs keep a 3:1 border at ${width} in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme })
      await page.goto("/screens/01-sign-in")
      await expectBoundary(page.getByRole("textbox", { name: "Email" }), "Email", info)
      await withChatFixtures(page)
      await page.goto("/")
      const composer = page.locator('[data-slot="input-group"]')
      await page.getByRole("textbox", { name: "Message" }).focus()
      await expectBoundary(composer, "Focused composer", info)
      await page.getByRole("textbox", { name: "Message" }).blur()
      await expectBoundary(composer, "Composer", info)
      if (width === 375) await page.locator('[data-slot="sidebar-trigger"]').click()
      await expectBoundary(page.getByRole("searchbox", { name: "Search chats" }), "Search", info)
    })

    test(`focused controls show a 2px ring at ${width} in ${colorScheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme })
      await page.goto("/screens/01-sign-in")
      const email = page.getByRole("textbox", { name: "Email" })
      await email.focus()
      await expectRing(email, "Email", info)
      await page.keyboard.press("Tab")
      await expectRing(page.getByRole("button", { name: "Continue with email" }), "Continue with email", info)
      await withChatFixtures(page)
      await page.goto("/")
      const message = page.getByRole("textbox", { name: "Message" })
      await message.focus()
      await expect(page.locator('[data-slot="input-group"]')).toHaveCSS("outline-style", "none")
      await expect(page.locator('[data-slot="input-group"]')).toHaveCSS("border-top-color", /^rgb\(31, 31, 31\)$/)
      await expectBoundary(page.locator('[data-slot="input-group"]'), "Focused composer", info)
      await expect(message).toHaveCSS("outline-style", "none")
      await page.screenshot({ path: info.outputPath("composer.png") })
      const model = page.getByRole("button", { name: /^Model:/ })
      await focusByKeyboard(model)
      await expectRing(model, "Model picker", info)
      await page.keyboard.press("ArrowDown")
      await expect(page.getByRole("menu")).toBeVisible()
      const item = page.locator('[role="menuitemradio"]:focus')
      await expectRing(item, "Model choice", info, "-2px")
      await page.screenshot({ path: info.outputPath("menu.png") })
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toBeHidden()
      if (width === 375) {
        await page.locator('[data-slot="sidebar-trigger"]').click()
        await expect(page.getByRole("button", { name: "Home", exact: true })).toBeFocused()
      }
      const search = page.getByRole("searchbox", { name: "Search chats" })
      await search.focus()
      await expectRing(search, "Search", info)
      const newChat = page.getByRole("button", { name: "New chat" })
      await search.press("Shift+Tab")
      await expect(newChat).toBeFocused()
      await expectRing(newChat, "New chat", info)
      await page.screenshot({ path: info.outputPath("sidebar.png") })
    })

    test(`reduced motion opens the menu and sidebar without motion at ${width} in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
      await withChatFixtures(page)
      await page.goto("/")
      const trigger = page.getByRole("button", { name: /^Model:/ })
      await expect(trigger).toBeVisible()
      const sidebar = page.locator('[data-slot="sidebar-trigger"]')
      const motion = await motionDuring(page, async () => {
        await trigger.click()
        await expect(page.getByRole("menu")).toBeVisible()
        await expect(page.getByRole("menu")).toHaveCSS("opacity", "1")
        await page.getByRole("menuitemradio", { name: /Mock Reasoning/ }).hover()
        await page.keyboard.press("Escape")
        await expect(page.getByRole("menu")).toBeHidden()
        await sidebar.click()
        if (width === 375) {
          await expect(page.getByRole("searchbox", { name: "Search chats" })).toBeVisible()
          await page.keyboard.press("Escape")
          await expect(page.getByRole("searchbox", { name: "Search chats" })).toBeHidden()
        } else {
          await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "collapsed")
          await sidebar.click()
          await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "expanded")
        }
      })
      expect(motion).toEqual([])
    })
  }
}

test("the desktop sidebar collapses without animating its layout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await withChatFixtures(page)
  await page.goto("/")
  const sidebar = page.locator('[data-slot="sidebar"]')
  const motion = await motionDuring(page, async () => {
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
  })
  expect(motion.filter((entry) => /^sidebar.* (width|left|right|height|padding)$/.test(entry))).toEqual([])
})

test("keyboard toggling the desktop sidebar keeps focus on a sidebar toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await withChatFixtures(page)
  await page.goto("/")
  const sidebar = page.locator('[data-slot="sidebar"]')
  const toggle = page.locator('[data-slot="sidebar-trigger"]')
  await toggle.focus()
  await page.keyboard.press("Enter")
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await expect(toggle).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await expect(toggle).toBeFocused()
})

test("popup motion is scoped and uses composite properties", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await withChatFixtures(page)
  await page.goto("/")
  await page.getByRole("button", { name: /^Model:/ }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toHaveCSS("transition-property", "opacity, scale, translate")
  await expect(menu).toHaveCSS("transition-duration", "0.15s")
  await expect(menu).toHaveCSS("transition-timing-function", "cubic-bezier(0.23, 1, 0.32, 1)")
  await expect(menu).toHaveCSS("animation-name", "none")
  await expect(page.locator('[data-slot="input-group"]')).toHaveCSS("transition-property", /background-color/)
})
