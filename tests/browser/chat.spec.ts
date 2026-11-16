import { expect, test } from "@playwright/test"
import { replyStream, savedConversation, withChatFixtures } from "./chat-fixtures"

test.beforeEach(async ({ page }) => {
  await withChatFixtures(page)
})

test("Enter sends only the latest user message, opens its URL, and keeps focus", async ({ page }) => {
  const requests: unknown[] = []
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ contentType: "text/event-stream", body: replyStream("The answer arrived.") })
  })
  await page.goto("/")
  const input = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: /Model: Mock Fast/ })).toBeVisible()
  await input.fill("First line")
  await input.press("Shift+Enter")
  await input.press("End")
  await input.press("a")
  expect(requests).toHaveLength(0)
  await expect(input).toHaveValue("First line\na")
  await input.press("Enter")
  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]+$/)
  await expect(page.locator(".is-assistant")).toContainText("The answer arrived.")
  await expect(input).toBeEmpty()
  await expect(input).toBeFocused()
  await input.fill("Follow up")
  await input.press("Enter")
  await expect.poll(() => requests.length).toBe(2)
  expect(requests).toEqual([
    {
      id: expect.any(String),
      model: "mock-fast",
      message: { id: expect.any(String), role: "user", parts: [{ type: "text", text: "First line\na" }] },
    },
    {
      id: expect.any(String),
      model: "mock-fast",
      message: { id: expect.any(String), role: "user", parts: [{ type: "text", text: "Follow up" }] },
    },
  ])
})

test("the composer grows to its cap and preserves a draft while stopping", async ({ page }) => {
  await page.goto("/screens/02-streaming-reply")
  const input = page.getByRole("textbox", { name: "Message" })
  await expect(page.getByRole("button", { name: "Stop display", exact: true })).toBeVisible()
  const initial = await input.boundingBox()
  await input.fill(Array.from({ length: 30 }, (_, i) => `Line ${i}`).join("\n"))
  await expect.poll(async () => (await input.boundingBox())?.height).toBeGreaterThan(initial?.height ?? 0)
  expect((await input.boundingBox())?.height).toBeLessThanOrEqual(192)
  const draft = await input.inputValue()
  await input.press("Enter")
  await expect(input).toHaveValue(draft)
  await page.getByRole("button", { name: "Stop display", exact: true }).click()
  await expect(
    page.getByText("Display paused. The reply continues on the server. Reopen this chat to see the full answer."),
  ).toBeVisible()
  await expect(input).toHaveValue(draft)
  await expect(input).toBeFocused()
})

for (const [status, text] of [
  [422, "This model is no longer available. Choose another model and retry."],
  [500, "Something went wrong with this reply. Try again."],
] as const) {
  test(`${status} keeps the question and retries with the chosen model`, async ({ page }) => {
    await page.route("**/api/conversations/*", (route) => route.fulfill({ status: 404, json: { error: "not found" } }))
    let tries = 0
    await page.route("**/api/chat", async (route) => {
      tries++
      if (tries === 1) return route.fulfill({ status, json: { error: "refused" } })
      expect(route.request().postDataJSON().model).toBe("mock-reasoning")
      await route.fulfill({ contentType: "text/event-stream", body: replyStream("Recovered.") })
    })
    await page.goto("/")
    await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
    await page.getByRole("textbox", { name: "Message" }).fill("Keep my question")
    await page.getByRole("textbox", { name: "Message" }).press("Enter")
    await expect(page.getByRole("alert")).toContainText(text)
    await expect(page.locator(".is-user")).toHaveText("Keep my question")
    await page.getByRole("button", { name: /Model:/ }).click()
    await page.getByRole("menuitemradio", { name: /Mock Reasoning/ }).click()
    await page.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(page.locator(".is-assistant")).toContainText("Recovered.")
    await expect(page.getByRole("alert")).toHaveCount(0)
  })
}

test("model choice survives a reload and removed models fall back", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Model:/ }).click()
  const choice = page.getByRole("menuitemradio", { name: /Mock Reasoning/ })
  await expect(choice).toContainText("Tools · Vision · Reasoning")
  await choice.click()
  await page.reload()
  await expect(page.getByRole("button", { name: "Model: Mock Reasoning" })).toBeVisible()
  await page.route("**/api/models", (route) => route.fulfill({ json: { models: [] } }))
  await page.reload()
  await expect(page.getByText("No models available")).toBeVisible()
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
})

test("a saved conversation reloads before accepting a follow-up", async ({ page }) => {
  await page.route("**/api/conversations/saved", (route) =>
    route.fulfill({
      json: {
        conversation: {
          id: "saved",
          owner: "person",
          title: "Saved",
          model: "mock-fast",
          createdAt: "2026-11-15T00:00:00.000Z",
          updatedAt: "2026-11-15T00:00:00.000Z",
        },
        messages: [
          { id: "q", role: "user", parts: [{ type: "text", text: "My saved question" }] },
          { id: "a", role: "assistant", parts: [{ type: "text", text: "My saved answer" }] },
        ],
      },
    }),
  )
  await page.goto("/c/saved")
  await expect(page.locator(".is-user")).toHaveText("My saved question")
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await page.reload()
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
})

test("a draft survives Enter while Retry waits for saved history", async ({ page }) => {
  const held = Promise.withResolvers<void>()
  let reads = 0
  await page.route("**/api/conversations/saved", async (route) => {
    reads++
    if (reads > 1) await held.promise
    await route.fulfill({ json: savedConversation })
  })
  await page.route("**/api/chat", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: replyStream("Retried answer") }),
  )
  await page.goto("/c/saved")
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  const input = page.getByRole("textbox", { name: "Message" })
  try {
    await input.fill("Keep this unsent draft")
    await input.press("Enter")
    await expect(input).toHaveValue("Keep this unsent draft")
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
  } finally {
    held.resolve()
  }
  await expect(page.locator(".is-assistant").last()).toContainText("Retried answer")
  await expect(input).toHaveValue("Keep this unsent draft")
})

test("returning to a chat preserves its pending Retry gate", async ({ page }) => {
  const held = Promise.withResolvers<void>()
  let reads = 0
  let generations = 0
  await page.route("**/api/conversations/saved", async (route) => {
    if (++reads > 1) await held.promise
    await route.fulfill({ json: savedConversation })
  })
  await page.route("**/api/chat", (route) => {
    generations++
    return route.fulfill({ contentType: "text/event-stream", body: replyStream("Only one retry") })
  })
  await page.goto("/c/saved")
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  try {
    await page.getByRole("button", { name: "New chat", exact: true }).click()
    await page.goBack()
    await expect(page.locator(".is-assistant")).toContainText("My saved answer")
    await page.getByRole("textbox", { name: "Message" }).fill("Draft after returning")
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled()
    await page.getByRole("button", { name: "Retry", exact: true }).evaluate((button) => {
      if (button instanceof HTMLButtonElement) button.click()
    })
  } finally {
    held.resolve()
  }
  await expect(page.locator(".is-assistant").last()).toContainText("Only one retry")
  expect(generations).toBe(1)
  expect(reads).toBe(2)
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Draft after returning")
})

test("sidebar reopening refreshes a paused reply after the server completes", async ({ page }) => {
  let completed = false
  let paused = false
  await page.route("**/api/conversations", (route) =>
    route.fulfill({ json: { conversations: [savedConversation.conversation] } }),
  )
  await page.route("**/api/conversations/saved", (route) =>
    route.fulfill({
      json: {
        ...savedConversation,
        messages: paused
          ? [
              ...savedConversation.messages,
              { id: "q2", role: "user", parts: [{ type: "text", text: "Continue" }] },
              {
                id: "reply",
                role: "assistant",
                parts: completed ? [{ type: "text", text: "PARTIAL FINAL SAVED ANSWER" }] : [],
                ...(completed ? {} : { metadata: { model: "mock-fast", reply: { state: "streaming" } } }),
              },
            ]
          : savedConversation.messages,
      },
    }),
  )
  await page.addInitScript(() => {
    const fetch = window.fetch
    window.fetch = (input, init) => {
      if (input !== "/api/chat") return fetch(input, init)
      const encoder = new TextEncoder()
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of [
                { type: "start", messageId: "reply" },
                { type: "text-start", id: "text" },
                { type: "text-delta", id: "text", delta: "PARTIAL" },
              ])
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
              init?.signal?.addEventListener("abort", () => controller.close(), { once: true })
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      )
    }
  })
  await page.goto("/c/saved")
  await expect(page.locator(".is-assistant")).toContainText("My saved answer")
  await page.getByRole("textbox", { name: "Message" }).fill("Continue")
  await page.getByRole("textbox", { name: "Message" }).press("Enter")
  await expect(page.locator(".is-assistant").last()).toHaveText("PARTIAL")
  await page.getByRole("button", { name: "Stop display", exact: true }).click()
  await expect(page.getByText(/Display paused/)).toBeVisible()
  paused = true
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await page.getByRole("link", { name: "Saved", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("still running on the server")
  completed = true
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("link", { name: "Saved", exact: true }).click()
  await expect(page.locator(".is-assistant").last()).toContainText("FINAL SAVED ANSWER")
  await expect(page.getByText(/Display paused/)).toHaveCount(0)
})

test("reopening an unaccepted paused request keeps the question available", async ({ page }) => {
  await page.route("**/api/conversations/*", (route) => route.fulfill({ status: 404, json: { error: "not found" } }))
  await page.addInitScript(() => {
    const fetch = window.fetch
    window.fetch = (input, init) =>
      input !== "/api/chat"
        ? fetch(input, init)
        : new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
              once: true,
            })
          })
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: /Model: Mock Fast/ })).toBeVisible()
  await page.getByRole("textbox", { name: "Message" }).fill("Keep my unanswered question")
  await page.getByRole("textbox", { name: "Message" }).press("Enter")
  await page.getByRole("button", { name: "Stop display", exact: true }).click()
  await page.getByRole("textbox", { name: "Message" }).fill("Private unsent draft")
  await page.getByRole("button", { name: "New chat", exact: true }).click()
  await page.goBack()
  await expect(page.locator(".is-user")).toContainText("Keep my unanswered question")
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Private unsent draft")
  await page.getByRole("textbox", { name: "Message" }).fill("A new draft")
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled()
})

test("reasoning, markdown tables, code copy, and reply copy work", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/screens/03-long-reply")
  await expect(page.locator("table")).toHaveCount(1)
  await page.getByText("Thought process", { exact: true }).click()
  await expect(page.getByText(/They want fewer requests while typing/)).toBeVisible()
  const scroll = page.getByRole("log").locator(":scope > div").first()
  await scroll.evaluate((element) => {
    element.scrollTop = 0
  })
  const codeCopy = page.locator('[data-streamdown="code-block"]').first().getByRole("button", { name: /copy/i })
  await codeCopy.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("export function useDebounced")
  await page.locator(".is-assistant").getByRole("button", { name: "Copy", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("| Approach |")
})

test("scrolling up releases auto-scroll and jump returns to the latest", async ({ page }) => {
  await page.addInitScript(() => {
    const fetch = window.fetch
    window.fetch = (input, init) => {
      if (input !== "/api/chat") return fetch(input, init)
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        start(controller) {
          const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          send({ type: "start", messageId: "reply" })
          send({ type: "text-start", id: "text" })
          const append = () =>
            send({
              type: "text-delta",
              id: "text",
              delta: "A paragraph to read while the reply continues.\n\n".repeat(60),
            })
          append()
          window.addEventListener("continue-reply", append)
          init?.signal?.addEventListener(
            "abort",
            () => {
              window.removeEventListener("continue-reply", append)
              controller.close()
            },
            { once: true },
          )
        },
      })
      return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }))
    }
  })
  await page.goto("/")
  await expect(page.getByRole("button", { name: /Model: Mock Fast/ })).toBeVisible()
  await page.getByRole("textbox", { name: "Message" }).fill("Give me a long reply")
  await page.getByRole("textbox", { name: "Message" }).press("Enter")
  const log = page.getByRole("log")
  const scroll = log.locator(":scope > div").first()
  await expect.poll(() => scroll.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeGreaterThan(1000)
  await expect.poll(() => scroll.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(2)
  await expect(log).toHaveAttribute("aria-busy", "true")
  const bottom = await scroll.evaluate((e) => e.scrollTop)
  await scroll.hover()
  await page.mouse.wheel(0, -900)
  const jump = page.getByRole("button", { name: "Jump to latest" })
  await expect(jump).toBeVisible()
  await expect.poll(() => scroll.evaluate((e) => e.scrollTop)).toBeLessThan(bottom - 500)
  const top = await scroll.evaluate((e) => e.scrollTop)
  for (let chunk = 0; chunk < 3; chunk++) {
    const height = await scroll.evaluate((e) => e.scrollHeight)
    await page.evaluate(() => window.dispatchEvent(new Event("continue-reply")))
    await expect.poll(() => scroll.evaluate((e) => e.scrollHeight)).toBeGreaterThan(height + 1000)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(log).toHaveAttribute("aria-busy", "true")
    expect(await scroll.evaluate((e) => e.scrollTop)).toBeLessThanOrEqual(top + 2)
    await expect(jump).toBeVisible()
  }
  await jump.click()
  await expect.poll(() => scroll.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(2)
  await expect(jump).toBeHidden()
  await page.getByRole("button", { name: "Stop display", exact: true }).click()
})

test("scrolling up during initial smooth scrolling releases the growing reply", async ({ page }) => {
  await page.goto("/screens/02-streaming-reply?tokens=5000")
  const log = page.getByRole("log")
  const scroll = log.locator(":scope > div").first()
  await expect.poll(() => scroll.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeGreaterThan(1000)
  await expect(log).toHaveAttribute("aria-busy", "true")
  await scroll.hover({ position: { x: 24, y: 100 } })
  await page.mouse.wheel(0, -900)
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible()
  const top = await scroll.evaluate((e) => e.scrollTop)
  const height = await scroll.evaluate((e) => e.scrollHeight)
  await expect.poll(() => scroll.evaluate((e) => e.scrollHeight)).toBeGreaterThan(height + 100)
  expect(await scroll.evaluate((e) => e.scrollTop)).toBeLessThanOrEqual(top + 2)
  await page.getByRole("button", { name: "Stop display", exact: true }).click()
})

test("Retry refreshes saved history and appends a distinct question", async ({ page }) => {
  const conversation = {
    id: "retry-saved",
    owner: "person",
    title: "Saved",
    model: "mock-fast",
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
  }
  const messages = [
    { id: "q", role: "user", parts: [{ type: "text", text: "My question" }] },
    { id: "a", role: "assistant", parts: [{ type: "text", text: "Authoritative answer" }] },
  ]
  await page.route("**/api/conversations/retry-saved", (route) => route.fulfill({ json: { conversation, messages } }))
  const requests: unknown[] = []
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ contentType: "text/event-stream", body: replyStream("New answer") })
  })
  await page.goto("/c/retry-saved")
  await expect(page.locator(".is-assistant")).toContainText("Authoritative answer")
  await page.getByRole("button", { name: "Retry", exact: true }).dblclick()
  await expect(page.locator(".is-assistant").last()).toContainText("New answer")
  await expect(page.locator(".is-user")).toHaveText(["My question", "My question"])
  await expect(page.locator(".is-assistant").first()).toContainText("Authoritative answer")
  expect(requests).toEqual([
    {
      id: "retry-saved",
      model: "mock-fast",
      message: { id: expect.not.stringMatching(/^q$/), role: "user", parts: [{ type: "text", text: "My question" }] },
    },
  ])
})

test("Retry waits for a reply that is still running on the server", async ({ page }) => {
  await page.route("**/api/conversations/running", (route) =>
    route.fulfill({
      json: {
        conversation: {
          id: "running",
          owner: "person",
          title: "Running",
          model: "mock-fast",
          createdAt: "2026-11-15T00:00:00.000Z",
          updatedAt: "2026-11-15T00:00:00.000Z",
        },
        messages: [
          { id: "q", role: "user", parts: [{ type: "text", text: "Keep answering" }] },
          { id: "a", role: "assistant", parts: [], metadata: { reply: { state: "streaming" } } },
        ],
      },
    }),
  )
  const posts: unknown[] = []
  await page.route("**/api/chat", async (route) => {
    posts.push(route.request().postDataJSON())
    await route.fulfill({ status: 409, json: { error: "already in progress" } })
  })
  await page.goto("/c/running")
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("A reply is already running or saved.")
  expect(posts).toHaveLength(0)
  await expect(page.locator(".is-user")).toHaveText("Keep answering")
})
