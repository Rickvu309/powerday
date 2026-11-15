import { expect, type Page } from "@playwright/test"

export const models = [
  {
    id: "mock-fast",
    provider: "mock",
    label: "Mock Fast",
    capabilities: { tools: false, vision: false, reasoning: false },
    contextWindow: 8192,
  },
  {
    id: "mock-reasoning",
    provider: "mock",
    label: "Mock Reasoning",
    capabilities: { tools: true, vision: true, reasoning: true },
    contextWindow: 32768,
  },
]

export const withModels = (page: Page) => page.route("**/api/models", (route) => route.fulfill({ json: { models } }))

export const savedConversation = {
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
}

export const replyStream = (text: string) =>
  [
    { type: "start", messageId: "reply" },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: text },
    { type: "text-end", id: "text" },
    { type: "finish" },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("") + "data: [DONE]\n\n"

export const settled = async (page: Page, screen: string) => {
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Model:/ })).toBeVisible()
  if (screen.includes("empty")) await expect(page.getByText("Explain a concept", { exact: true })).toBeEnabled()
  else if (screen.includes("model-menu")) {
    await page.getByRole("button", { name: /Model:/ }).click()
    await expect(page.getByRole("menuitemradio", { name: /Mock Reasoning/ })).toBeVisible()
  } else if (screen.includes("streaming")) {
    await expect(page.getByRole("button", { name: "Stop display", exact: true })).toBeVisible()
    await expect(page.locator(".is-assistant")).toContainText("hook")
  } else if (screen.includes("error") || screen.includes("signed-out") || screen.includes("unavailable")) {
    await expect(page.getByRole("alert")).toBeVisible()
  } else if (screen.includes("stopped")) await expect(page.getByText("Reply interrupted.")).toBeVisible()
  else await expect(page.locator("table")).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}
