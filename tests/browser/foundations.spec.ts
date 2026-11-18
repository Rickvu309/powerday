import { expect, test } from "@playwright/test"
import { withChatFixtures, settled } from "./chat-fixtures"

for (const colorScheme of ["light", "dark"] as const) {
  test(`syntax keywords and browser chrome stay light when the system is ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.emulateMedia({ colorScheme })
    await withChatFixtures(page)
    await page.goto("/screens/03-long-reply")
    await settled(page, "long-reply")
    const keywords = page
      .locator('[data-streamdown="code-block-body"] span[style]')
      .filter({ hasText: /^(const|return|import|export)$/ })
    await expect(keywords.first()).toBeVisible()
    await page.locator('[data-streamdown="code-block-body"]').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`${colorScheme}.png`) })
    const ratios = await keywords.evaluateAll((elements) => {
      const rgb = (value: string) => {
        const context = document.createElement("canvas").getContext("2d")
        if (!context) throw new Error("Missing canvas")
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      }
      const luminance = (channels: number[]) =>
        channels
          .slice(0, 3)
          .map((channel) => channel / 255)
          .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
      return elements.map((element) => {
        let ancestor: Element | null = element
        let background = [0, 0, 0, 0]
        while (ancestor && background[3] === 0) {
          background = rgb(getComputedStyle(ancestor).backgroundColor)
          ancestor = ancestor.parentElement
        }
        const token = getComputedStyle(element).getPropertyValue("--syntax-keyword").trim()
        if (rgb(getComputedStyle(element).color).join() !== rgb(token).join())
          throw new Error("Keyword does not use --syntax-keyword")
        const foreground = luminance(rgb(getComputedStyle(element).color))
        const surface = luminance(background)
        return (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05)
      })
    })
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5)
    info.annotations.push({ type: "keyword contrast", description: `${Math.min(...ratios).toFixed(4)}:1` })
    const background = await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("--background").trim())
    expect(await page.locator("html").evaluate((element) => getComputedStyle(element).colorScheme)).toBe("light")
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", background)
  })
}

test("the mobile shell declares safe areas and contains scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await withChatFixtures(page)
  await page.goto("/screens/03-long-reply")
  await settled(page, "long-reply")
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
  )
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior", "none")
  await expect(page.locator("body")).toHaveCSS("overscroll-behavior", "none")
  await expect(page.getByRole("button", { name: /^Model:/ })).toHaveCSS("touch-action", "manipulation")
  await expect(page.locator('[role="log"] > div').first()).toHaveCSS("overscroll-behavior", "contain")
  await page.locator("html").evaluate((element) => {
    element.style.setProperty("--safe-area-top", "24px")
    element.style.setProperty("--safe-area-bottom", "20px")
  })
  await expect(page.getByRole("textbox", { name: "Message" }).locator("xpath=../../..")).toHaveCSS(
    "padding-bottom",
    "36px",
  )
  await expect(page.locator('[data-slot="sidebar-inset"] > header')).toHaveCSS("padding-top", "24px")
  await expect(page.locator('[data-slot="sidebar-inset"] > header')).toHaveCSS("height", "72px")
  await page.locator('[data-slot="sidebar-trigger"]').click()
  await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCSS("overscroll-behavior", "contain")
  await expect(page.locator('[data-mobile="true"]')).toHaveCSS("padding-top", "24px")
  await expect(page.locator('[data-mobile="true"]')).toHaveCSS("padding-bottom", "20px")
})

for (const mode of ["pointer", "keyboard", "reduce"] as const) {
  test(`menu and drawer obey ${mode} motion policy and restore focus`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.emulateMedia({ reducedMotion: mode === "reduce" ? "reduce" : "no-preference" })
    await withChatFixtures(page)
    await page.goto("/")
    const model = page.getByRole("button", { name: /^Model:/ })
    await expect(model).toBeVisible()
    await page
      .locator("html")
      .evaluate(
        (element, modality) => element.setAttribute("data-input-modality", modality),
        mode === "keyboard" ? "keyboard" : "pointer",
      )
    await page.evaluate(() => {
      const animations: Animation[] = []
      const observer = new MutationObserver(() => {
        for (const animation of document.getAnimations()) {
          if (animations.includes(animation)) continue
          animations.push(animation)
          animation.playbackRate = 0.2
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
      Object.assign(window, { foundationAnimations: animations })
    })
    if (mode === "keyboard") {
      await model.focus()
      await page.keyboard.press("Enter")
    } else await model.click()
    const menu = page.locator('[data-slot="popover-content"]')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS("animation-name", "none")
    await expect(menu).toHaveCSS("transition-duration", mode === "pointer" ? "0.15s" : "0s")
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(model).toBeFocused()
    const trigger = page.locator('[data-slot="sidebar-trigger"]')
    if (mode === "keyboard") {
      await trigger.focus()
      await page.keyboard.press("Enter")
    } else await trigger.click()
    const drawer = page.locator('[data-mobile="true"]')
    await expect(drawer).toBeVisible()
    await expect(drawer).toHaveCSS("transition-duration", mode === "pointer" ? "0.2s" : "0s")
    await page.getByRole("searchbox", { name: "Search chats" }).focus()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Control+b")
    await expect(drawer).toBeVisible()
    await page.keyboard.press("Control+b")
    await expect(drawer).toBeHidden()
    const animations = await page.evaluate(() => {
      const animations = "foundationAnimations" in window ? window.foundationAnimations : []
      if (!Array.isArray(animations)) throw new Error("Missing motion observer")
      return animations.map((animation: Animation) => ({
        kind: animation instanceof CSSTransition ? animation.transitionProperty : "keyframes",
        slot: animation.effect instanceof KeyframeEffect ? animation.effect.target?.getAttribute("data-slot") : null,
      }))
    })
    if (mode !== "pointer") expect(animations).toEqual([])
    else {
      expect(animations.some((animation) => animation.slot === "popover-content")).toBe(true)
      expect(animations.some((animation) => animation.slot === "sheet-overlay")).toBe(true)
      expect(animations.some((animation) => animation.slot === "sidebar")).toBe(true)
      expect(
        animations
          .filter((animation) => ["popover-content", "sidebar", "sheet-overlay"].includes(animation.slot ?? ""))
          .every((animation) => ["opacity", "scale", "translate", "transform"].includes(animation.kind)),
      ).toBe(true)
    }
  })
}
