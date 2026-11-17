import { expect, test, type Page } from "@playwright/test"
import { models, replyStream, savedConversation, withChatFixtures } from "./chat-fixtures"

const title =
  "Plan the international research release with Vietnamese and Arabic documentation, accessibility review, regional rollout and final stakeholder approval — compare the revised launch checklist for November".slice(
    0,
    200,
  )
const label = "Llama 3.3 70B Instruct — Multilingual Research Preview 2026"

async function navigationFixtures(page: Page) {
  await withChatFixtures(page)
  const conversations = [
    { ...savedConversation.conversation, id: "first", title },
    { ...savedConversation.conversation, id: "second", title: "Second chat" },
  ]
  await page.route("**/api/conversations**", (route) => {
    const url = new URL(route.request().url())
    const conversation = conversations.find((each) => url.pathname.endsWith(`/${each.id}`))
    return route.fulfill({
      json: conversation
        ? { conversation, messages: savedConversation.messages }
        : url.searchParams.has("q")
          ? { found: conversations.map((conversation) => ({ conversation, snippet: "Research release" })) }
          : { conversations },
    })
  })
}

for (const width of [320, 375]) {
  for (const length of [57, 200]) {
    test(`${length}-character model labels fit at ${width}px and 200% text`, async ({ page }, info) => {
      await withChatFixtures(page)
      const long =
        `${label} — ${"International research preview with extended context and multilingual tools ".repeat(3)}`.slice(
          0,
          length,
        )
      expect(long).toHaveLength(length)
      await page.route("**/api/models", (route) => route.fulfill({ json: { models: [{ ...models[0], label: long }] } }))
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/")
      const trigger = page.getByRole("button", { name: `Model: ${long}`, exact: true })
      await expect(trigger).toBeVisible()
      for (const size of ["100%", "200%"]) {
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size
        }, size)
        if (size === "100%")
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await trigger.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true)
        if (size === "100%") await page.screenshot({ path: info.outputPath("model-trigger.png") })
        await trigger.click()
        const choice = page.getByRole("menuitemradio", { name: long, exact: true })
        await expect(choice).toBeVisible()
        expect(await choice.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        if (size === "100%")
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (size === "100%") await page.screenshot({ path: info.outputPath("model-menu.png") })
        await page.keyboard.press("Escape")
      }
    })
  }
}

test("search Tab reaches the first result and the failure retry", async ({ page }) => {
  await navigationFixtures(page)
  await page.goto("/")
  const search = page.getByRole("searchbox", { name: "Search chats" })
  await search.fill("research")
  await expect(page.getByRole("status")).toHaveText("2 chats found.")
  await search.press("Tab")
  await expect(page.locator("a[href='/c/first']")).toBeFocused()
  await page.route("**/api/conversations?q=*", (route) => route.fulfill({ status: 500 }))
  await search.fill("failure")
  await expect(page.getByRole("status")).toHaveText("Couldn’t search your chats.")
  await search.press("Tab")
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeFocused()
})

test("full chat titles are available by mouse and keyboard", async ({ page }, info) => {
  await navigationFixtures(page)
  await page.goto("/")
  const link = page.locator("a[href='/c/first']")
  await link.hover()
  await expect(page.getByRole("tooltip")).toHaveText(title)
  await page.screenshot({ path: info.outputPath("title-tooltip.png") })
  await page.mouse.move(1200, 800)
  await expect(page.getByRole("tooltip")).toBeHidden()
  await page.keyboard.press("Tab")
  await link.focus()
  await expect(page.getByRole("tooltip")).toHaveText(title)
})

test("touch Options exposes the full title before actions", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 900 },
  })
  const page = await context.newPage()
  await navigationFixtures(page)
  await page.goto("/")
  await page.getByRole("button", { name: "Toggle Sidebar" }).tap()
  await page.getByRole("button", { name: `Options for ${title}`, exact: true }).tap()
  const heading = page.locator('[data-slot="dropdown-menu-label"]')
  await expect(heading).toHaveText(title)
  expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.locator("a[href='/c/first']").tap()
  await expect(page.locator("#conversation-main")).toBeFocused()
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
  await context.close()
})

test("skip link is first and focuses the conversation", async ({ page }) => {
  await navigationFixtures(page)
  await page.goto("/")
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
  await page.getByRole("button", { name: "New chat", exact: true }).focus()
  await page.keyboard.press("Shift+Tab")
  const skip = page.getByRole("link", { name: "Skip to conversation" })
  await expect(skip).toBeFocused()
  await skip.press("Enter")
  await expect(page.locator("#conversation-main")).toBeFocused()
  await expect(page).toHaveURL(/\/$/)
})

test("explicit navigation changes title and focus; prefetch and search do not", async ({ page }) => {
  await navigationFixtures(page)
  await page.goto("/")
  const message = page.getByRole("textbox", { name: "Message" })
  await message.fill("Keep my focus")
  await page.locator("a[href='/c/first']").hover()
  await expect(message).toBeFocused()
  await expect(page).toHaveTitle("New chat · Power Chat")
  await page.locator("a[href='/c/first']").click()
  await expect(page).toHaveTitle(`${title} · Power Chat`)
  await expect(page.locator("#conversation-main")).toBeFocused()
  await expect(page.getByText("My saved answer", { exact: true })).toBeVisible()
  await message.fill("Still typing")
  await page.locator("a[href='/c/second']").hover()
  await expect(message).toBeFocused()
  await page.locator("a[href='/c/second']").click()
  await expect(page).toHaveTitle("Second chat · Power Chat")
  await expect(page.locator("#conversation-main")).toBeFocused()
  await page.goBack()
  await expect(page).toHaveTitle(`${title} · Power Chat`)
  await expect(page.getByText("My saved answer", { exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveTitle("Second chat · Power Chat")
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await expect(page).toHaveTitle("New chat · Power Chat")
  await expect(page.locator("#conversation-main")).toBeFocused()
})

test("modifier and middle clicks retain native chat links", async ({ page, context }) => {
  await navigationFixtures(page)
  await page.goto("/")
  for (const options of [{ modifiers: ["ControlOrMeta"] }, { button: "middle" }] as const) {
    await page.locator("a[href='/c/first']").click(options)
    await expect(page).toHaveURL(/\/$/)
  }
  for (const other of context.pages()) if (other !== page) await other.close()
})

test("the app boundary records keyboard and pointer input including portals", async ({ page }) => {
  await navigationFixtures(page)
  await page.goto("/")
  await expect(page.getByRole("button", { name: /^Model:/ })).toBeVisible()
  await page.keyboard.press("Tab")
  await expect(page.locator("html")).toHaveAttribute("data-input-modality", "keyboard")
  await page.getByRole("button", { name: /^Model:/ }).click()
  await expect(page.locator("html")).toHaveAttribute("data-input-modality", "pointer")
  await page.keyboard.press("ArrowDown")
  await expect(page.locator("html")).toHaveAttribute("data-input-modality", "keyboard")
})

test("mobile drawer repeatedly closes with Escape and restores its trigger", async ({ page }) => {
  await navigationFixtures(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/")
  const trigger = page.getByRole("button", { name: "Toggle Sidebar" })
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(trigger).toBeFocused()
  }
})

test("51 chats paginate without duplicating or losing the final row", async ({ page }) => {
  await withChatFixtures(page)
  const conversations = Array.from({ length: 51 }, (_, index) => ({
    ...savedConversation.conversation,
    id: `page-${index}`,
    title: `Research ${index}`,
  }))
  await page.route("**/api/conversations**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("before")
        ? { conversations: conversations.slice(50) }
        : { conversations: conversations.slice(0, 50), next: "1.page-49" },
    }),
  )
  await page.goto("/")
  const links = page.locator("a[href^='/c/']")
  await expect(links).toHaveCount(50)
  await links.last().scrollIntoViewIfNeeded()
  await expect(links).toHaveCount(51)
  await expect(page.locator("a[href='/c/page-50']")).toHaveCount(1)
})

test("streamed tokens leave focus in the composer", async ({ page }) => {
  await withChatFixtures(page)
  await page.goto("/screens/02-streaming-reply?tokens=5000")
  const message = page.getByRole("textbox", { name: "Message" })
  await message.fill("Keep typing while the reply arrives")
  const response = page.locator(".is-assistant")
  await expect(response).toContainText("Debouncing")
  const before = (await response.textContent())?.length ?? 0
  await expect.poll(async () => (await response.textContent())?.length ?? 0).toBeGreaterThan(before)
  await expect(message).toBeFocused()
  await expect(message).toHaveValue("Keep typing while the reply arrives")
})

test("Escape closes a nested menu or confirmation before the mobile drawer", async ({ page }) => {
  await navigationFixtures(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/")
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  const options = page.getByRole("button", { name: `Options for ${title}`, exact: true })
  await options.click()
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toBeHidden()
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeVisible()
  await options.click()
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Delete chat?", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "Delete chat?", exact: true })).toBeHidden()
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
})

test("navigation waits for saved history before moving focus", async ({ page }) => {
  await navigationFixtures(page)
  let release = () => {}
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/conversations/first", async (route) => {
    await waiting
    await route.fulfill({
      json: { ...savedConversation, conversation: { ...savedConversation.conversation, id: "first", title } },
    })
  })
  await page.goto("/")
  await page.locator("a[href='/c/first']").click()
  await expect(page.locator("#conversation-main")).not.toBeFocused()
  release()
  await expect(page).toHaveTitle(`${title} · Power Chat`)
  await expect(page.locator("#conversation-main")).toBeFocused()
})

test("chat Retry preserves its history gate while the full title is shown", async ({ page }) => {
  await withChatFixtures(page)
  const held = Promise.withResolvers<void>()
  let reads = 0
  let replies = 0
  await page.route("**/api/conversations/saved", async (route) => {
    if (++reads === 2) await held.promise
    await route.fulfill({ json: { ...savedConversation, conversation: { ...savedConversation.conversation, title } } })
  })
  await page.route("**/api/chat", (route) => {
    replies++
    return route.fulfill({ contentType: "text/event-stream", body: replyStream("Retried with the title shown") })
  })
  await page.goto("/c/saved")
  await expect(page.getByText("My saved answer", { exact: true })).toBeVisible()
  await expect(page).toHaveTitle(`${title} · Power Chat`)
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  const input = page.getByRole("textbox", { name: "Message" })
  try {
    await input.fill("Keep this draft")
    await input.press("Enter")
    await expect(input).toHaveValue("Keep this draft")
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
  } finally {
    held.resolve()
  }
  await expect(page.locator(".is-assistant").last()).toContainText("Retried with the title shown")
  await expect(page).toHaveTitle(`${title} · Power Chat`)
  await expect(input).toHaveValue("Keep this draft")
  expect(reads).toBe(2)
  expect(replies).toBe(1)
})
