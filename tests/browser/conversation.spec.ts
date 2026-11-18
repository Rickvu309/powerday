import { readdir } from "node:fs/promises"
import { createServer } from "node:http"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { replyStream, savedConversation, withChatFixtures } from "./chat-fixtures"

const projectUrl =
  "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved"

for (const width of [320, 375]) {
  test(`complete identifiers remain selectable without document overflow at ${width}px`, async ({ page }) => {
    await withChatFixtures(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/screens/70-long-identifiers")
    const bubble = page.locator(".is-user").first()
    await expect(bubble).toContainText(projectUrl)
    expect(
      await bubble.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return selection?.toString()
      }),
    ).toContain(projectUrl)
    expect(await bubble.locator(":scope > div").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test("code and tables scroll from the keyboard", async ({ page }) => {
  await withChatFixtures(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/screens/71-keyboard-code-table")
  for (const name of ["Code example", "Data table"]) {
    const region = page.getByRole("region", { name, exact: true }).first()
    await expect(region).toBeVisible()
    await region.focus()
    await expect(region).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await page.keyboard.press("ArrowDown")
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test("fine pointer Enter sends, Shift+Enter and IME preserve drafting", async ({ page }) => {
  await withChatFixtures(page)
  const prompts: unknown[] = []
  await page.route("**/api/chat", (route) => {
    prompts.push(route.request().postDataJSON())
    return route.fulfill({ contentType: "text/event-stream", body: replyStream("Done") })
  })
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await field.fill("First")
  await field.press("Shift+Enter")
  await expect(field).toHaveValue("First\n")
  await field.evaluate((element) =>
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })),
  )
  expect(prompts).toHaveLength(0)
  await field.press("Enter")
  await expect(page.locator(".is-assistant")).toContainText("Done")
  expect(prompts).toHaveLength(1)
})

test("touch Enter inserts a newline and the 44px send button submits", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 900 } })
  const page = await context.newPage()
  await withChatFixtures(page)
  let posts = 0
  await page.route("**/api/chat", (route) => {
    posts++
    return route.fulfill({ contentType: "text/event-stream", body: replyStream("Touch reply") })
  })
  await page.goto(test.info().project.use.baseURL ?? "")
  const field = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await field.fill("Touch question")
  await field.press("Enter")
  await expect(field).toHaveValue("Touch question\n")
  expect(posts).toBe(0)
  const send = page.getByRole("button", { name: "Send", exact: true })
  expect((await send.boundingBox())?.height).toBe(44)
  await send.tap()
  await expect(page.locator(".is-assistant")).toContainText("Touch reply")
  expect(posts).toBe(1)
  await context.close()
})

test("a cold thread keeps the sent prompt visible and composer stationary", async ({ page }) => {
  await withChatFixtures(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/assets\/thread-(?!loading-).*\.js$/, async (route) => {
    await held
    await route.continue()
  })
  await page.route("**/api/chat", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: replyStream("Finished") }),
  )
  await page.goto("/")
  const field = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  await field.fill("Visible through cold loading")
  await field.press("Enter")
  await expect(page.getByText("Loading reply…", { exact: true })).toBeVisible()
  await expect(page.getByText("Visible through cold loading", { exact: true })).toBeVisible()
  const before = await field.boundingBox()
  release()
  await expect(page.locator(".is-assistant")).toContainText("Finished")
  expect((await field.boundingBox())?.y).toBe(before?.y)
})

test("checking a paused reply reads history without another prompt", async ({ page }) => {
  await withChatFixtures(page)
  let reads = 0
  let posts = 0
  await page.route("**/api/chat", (route) => {
    posts++
    return route.abort()
  })
  await page.route("**/api/conversations/saved", (route) => {
    reads++
    return route.fulfill({
      json: {
        ...savedConversation,
        messages: [
          savedConversation.messages[0],
          {
            ...savedConversation.messages[1],
            metadata: {
              reply:
                reads < 3
                  ? { state: "streaming" }
                  : {
                      state: "complete",
                      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, reasoningTokens: 0 },
                    },
            },
          },
        ],
      },
    })
  })
  await page.goto("/c/saved")
  const refresh = page.getByRole("button", { name: "Check for finished reply" })
  await expect(refresh).toBeVisible()
  await refresh.click()
  await expect(refresh).toBeVisible()
  await refresh.click()
  await expect(refresh).toHaveCount(0)
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(reads).toBe(3)
  expect(posts).toBe(0)
})

for (const path of ["/", "/c/saved"]) {
  test(`complete cold JavaScript graph for ${path}`, async ({ page, baseURL }, info) => {
    await withChatFixtures(page)
    await page.route("**/api/conversations/saved", (route) => route.fulfill({ json: savedConversation }))
    if (!baseURL) throw new Error("Missing origin")
    const assets = await readdir("apps/chat/dist/client/assets")
    const upstreamUrls = new Map(
      ["/", "/c/saved", "/api/auth/methods", ...assets.map((name) => `/assets/${name}`)].map((path) => [
        path,
        new URL(path, baseURL),
      ]),
    )
    const server = createServer(async (request, response) => {
      const target = upstreamUrls.get(request.url ?? "/")
      if (!target) {
        response.writeHead(404)
        response.end()
        return
      }
      const upstream = await fetch(target)
      const headers = Object.fromEntries(upstream.headers)
      delete headers["content-encoding"]
      delete headers["content-length"]
      delete headers["transfer-encoding"]
      let body = Buffer.from(await upstream.arrayBuffer())
      if (headers["content-type"]?.includes("javascript")) {
        body = gzipSync(body, { level: 9 })
        headers["content-encoding"] = "gzip"
      }
      response.writeHead(upstream.status, { ...headers, "content-length": String(body.length) })
      response.end(body)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing gzip address")
    try {
      const bodies = new Map<string, number>()
      const pending: Promise<void>[] = []
      page.on("response", (response) => {
        if (response.request().resourceType() !== "script" && !new URL(response.url()).pathname.endsWith(".js")) return
        pending.push(
          response.body().then((body) => {
            expect(response.status()).toBe(200)
            expect(response.headers()["content-encoding"]).toBe("gzip")
            bodies.set(response.url(), gzipSync(body, { level: 9 }).length)
          }),
        )
      })
      await page.goto(`http://127.0.0.1:${address.port}${path}`)
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
      if (path !== "/") await expect(page.locator(".is-assistant")).toContainText("My saved answer")
      await page.waitForLoadState("networkidle")
      await Promise.all(pending)
      const gzipBytes = [...bodies.values()].reduce((sum, size) => sum + size, 0)
      await info.attach("cold-js-graph", {
        body: JSON.stringify(
          {
            path,
            gzipBytes,
            method:
              "Complete browser JS response graph served with gzip level 9; decoded bodies recompressed for byte accounting",
            assets: Object.fromEntries(bodies),
          },
          null,
          2,
        ),
        contentType: "application/json",
      })
      console.log(JSON.stringify({ path, gzipBytes }))
      expect(bodies.size).toBeGreaterThan(0)
      expect([...bodies.keys()].some((url) => /(?:mermaid|katex|github-light|typescript)-/.test(url))).toBe(false)
      expect(gzipBytes).toBeLessThanOrEqual(path === "/" ? 200000 : Math.floor(376938 * 1.02))
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
}

for (const width of [375, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const reducedMotion of ["reduce", "no-preference"] as const) {
      for (const screen of [
        "70-long-identifiers",
        "71-keyboard-code-table",
        "72-display-paused",
        "73-server-still-running",
        "74-finished-after-refresh",
        "75-cold-thread-loading",
        "76-multiline-mobile",
      ]) {
        test(`${screen} ${width} ${colorScheme} ${reducedMotion}`, async ({ page }, info) => {
          await withChatFixtures(page)
          await page.setViewportSize({ width, height: 900 })
          await page.emulateMedia({ colorScheme, reducedMotion })
          await page.goto(`/screens/${screen}`)
          await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
          if (screen.startsWith("71"))
            await expect(page.getByRole("region", { name: "Code example" }).first()).toBeVisible()
          else if (!screen.startsWith("75")) await expect(page.locator(".is-user").first()).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          if (screen.startsWith("70") || screen.startsWith("71"))
            await page
              .getByRole("log")
              .locator(":scope > div")
              .first()
              .evaluate((element) => {
                element.scrollTop = 0
              })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          if (reducedMotion === "reduce")
            expect(
              await page.evaluate(
                () => document.getAnimations().filter((animation) => animation.playState === "running").length,
              ),
            ).toBe(0)
          const path = info.outputPath(`${screen}-${width}-${colorScheme}-${reducedMotion}.png`)
          await page.screenshot({ path })
          await info.attach("screen", { path, contentType: "image/png" })
        })
      }
    }
  }
}

test("touch stop pauses display and keeps the composer in place", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 900 },
  })
  const page = await context.newPage()
  await withChatFixtures(page)
  await page.goto("/screens/02-streaming-reply?tokens=5000")
  const stop = page.getByRole("button", { name: "Stop display", exact: true })
  await expect(stop).toBeVisible()
  const field = page.getByRole("textbox", { name: "Message" })
  const before = await field.boundingBox()
  expect((await stop.boundingBox())?.height).toBe(44)
  await stop.tap()
  await expect(page.getByText("Display paused. Your reply is still being saved.", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Check for finished reply" })).toBeVisible()
  expect((await field.boundingBox())?.y).toBe(before?.y)
  await context.close()
})

test("syntax enhancement preserves selectable code geometry", async ({ page }) => {
  await withChatFixtures(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/assets/highlighted-body-*.js", async (route) => {
    await held
    await route.continue()
  })
  await page.goto("/screens/71-keyboard-code-table")
  const code = page.getByRole("region", { name: "Code example" }).first()
  await expect(code).toContainText("const value0")
  await code.scrollIntoViewIfNeeded()
  const before = await code.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  release()
  await expect(code.locator('span[style*="--sdm-c: #"]').first()).toBeVisible()
  await code.scrollIntoViewIfNeeded()
  expect(
    await code.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    })),
  ).toEqual(before)
})

test("an interrupted historical answer retains its recovery copy after a follow-up", async ({ page }) => {
  await withChatFixtures(page)
  await page.route("**/api/conversations/saved", (route) =>
    route.fulfill({
      json: {
        ...savedConversation,
        messages: [
          savedConversation.messages[0],
          {
            ...savedConversation.messages[1],
            metadata: {
              reply: {
                state: "stopped",
                usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, reasoningTokens: 0 },
              },
            },
          },
          { id: "q2", role: "user", parts: [{ type: "text", text: "Follow-up" }] },
          { id: "a2", role: "assistant", parts: [{ type: "text", text: "Complete follow-up answer" }] },
        ],
      },
    }),
  )
  await page.goto("/c/saved")
  await expect(page.locator(".is-assistant").first()).toContainText("Reply interrupted. Try again to get a new reply.")
  await expect(page.locator(".is-assistant").last()).toContainText("Complete follow-up answer")
})

for (const [language, bold, suffix] of [
  ["Korean", "한글！", "문장"],
  ["Japanese", "日本語！", "文章"],
  ["Chinese", "中文！", "句子"],
  ["Hangul Jamo", "한！", "글"],
  ["half-width Katakana", "ｶﾅ！", "ﾌﾞﾝ"],
  ["full-width punctuation", "Ａ！", "Ｂ"],
]) {
  test(`saved ${language} emphasis survives deferred CJK loading`, async ({ page }) => {
    await withChatFixtures(page)
    await page.route("**/api/conversations/saved", (route) =>
      route.fulfill({
        json: {
          ...savedConversation,
          messages: [
            savedConversation.messages[0],
            {
              ...savedConversation.messages[1],
              parts: [{ type: "text", text: `**${bold}**${suffix}` }],
            },
          ],
        },
      }),
    )
    await page.goto("/c/saved")
    await expect(page.locator('.is-assistant [data-streamdown="strong"]')).toHaveText(bold)
    await expect(page.locator(".is-assistant")).toContainText(`${bold}${suffix}`)
  })
}
