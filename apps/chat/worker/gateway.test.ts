import { streamText } from "ai"
import { expect, test, vi } from "vitest"
import { parseCatalog } from "@powerday/chat-core"
import { catalogConfig } from "../../../packages/chat-core/src/catalog.fixture"
import { modelGateway } from "./gateway"

const unusedBindingMethod = () => {
  throw new Error("unexpected AI binding method")
}

const catalog = parseCatalog({
  providers: [{ id: "cloudflare", kind: "workers-ai", label: "Cloudflare" }],
  models: [{ ...catalogConfig.models[0], provider: "cloudflare", upstreamId: "@cf/zai-org/glm-4.7-flash" }],
})

test("streams Workers AI through the configured gateway without a provider key", async () => {
  const run = vi
    .fn()
    .mockResolvedValue(
      new Response(
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n' +
          "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      ),
    )
  const binding: Ai = {
    run,
    aiGatewayLogId: null,
    gateway: unusedBindingMethod,
    websearch: unusedBindingMethod,
    aiSearch: unusedBindingMethod,
    autorag: unusedBindingMethod,
    models: unusedBindingMethod,
    toMarkdown: unusedBindingMethod,
  }
  const gateway = modelGateway({ AI: binding, AI_GATEWAY_NAME: "test-gateway" }, catalog)
  const result = streamText({ model: gateway.model([...catalog.models.values()][0]!), prompt: "Hi", maxRetries: 0 })
  const chunks = []
  for await (const chunk of result.textStream) chunks.push(chunk)
  expect(chunks).toEqual(["Hello", " world"])
  expect((await result.usage).outputTokens).toBe(2)
  expect(run).toHaveBeenCalledWith(
    "@cf/zai-org/glm-4.7-flash",
    expect.objectContaining({ stream: true }),
    expect.objectContaining({ gateway: expect.objectContaining({ id: "test-gateway", collectLog: true }) }),
  )
})

test("refuses a Workers AI catalog without the binding or gateway name", () => {
  expect(() => modelGateway({}, catalog)).toThrow("Workers AI needs")
})
