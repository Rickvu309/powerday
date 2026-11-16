import { expect, test } from "vitest"
import { ModelId, ProviderId } from "@powerday/chat-core"
import { modelChoice } from "./model-choice"

test("a failed catalog reloads once and becomes ready", async () => {
  const model = {
    id: ModelId.parse("mock"),
    provider: ProviderId.parse("mock"),
    label: "Mock",
    contextWindow: 8192,
    capabilities: { tools: false, vision: false, reasoning: false },
  }
  let attempts = 0
  const choice = modelChoice(async () => {
    attempts += 1
    if (attempts === 1) throw new Error("offline")
    return [model]
  })
  const unsubscribe = choice.subscribe(() => {})
  await expect.poll(choice.read).toEqual({ state: "failed" })
  await Promise.all([choice.reload(), choice.reload()])
  expect(attempts).toBe(2)
  expect(choice.read()).toEqual({ state: "ready", models: [model], chosen: model })
  unsubscribe()
})
