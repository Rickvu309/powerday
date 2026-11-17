import { streamText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseCatalog } from "./catalog.js"
import { catalogConfig } from "./catalog.fixture.js"
import { createModelGateway } from "./gateway.js"

const [model] = catalogConfig.models

const catalogOf = (kind: string) =>
  parseCatalog({
    providers: [{ id: "upstream", kind, label: "Upstream" }],
    models: [{ ...model, provider: "upstream", upstreamId: "model-x" }],
  })

const config = { accountId: "account-1", name: "power-chat", token: "gateway-token" }

const requestTo = async (kind: string) => {
  const requests: { url: string; headers: Headers }[] = []
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    requests.push({ url: input, headers: new Headers(init.headers) })
    return Response.json({ error: { message: "refused by the test" } }, { status: 400 })
  })
  const catalog = catalogOf(kind)
  const entry = [...catalog.models.values()][0]!
  await streamText({
    model: createModelGateway(catalog, config).model(entry),
    prompt: "Hi",
    maxRetries: 0,
  }).consumeStream()
  return requests
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createModelGateway", () => {
  it.each([
    ["openai", "https://gateway.ai.cloudflare.com/v1/account-1/power-chat/openai/responses"],
    ["anthropic", "https://gateway.ai.cloudflare.com/v1/account-1/power-chat/anthropic/v1/messages"],
    [
      "google",
      "https://gateway.ai.cloudflare.com/v1/account-1/power-chat/google-ai-studio/v1beta/models/model-x:streamGenerateContent?alt=sse",
    ],
  ])("sends %s calls to its AI Gateway endpoint with the gateway token and no provider key", async (kind, url) => {
    const [request, ...more] = await requestTo(kind)
    expect(more).toEqual([])
    expect(request?.url).toBe(url)
    expect(request?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token")
    for (const name of ["authorization", "x-api-key", "x-goog-api-key"]) expect(request?.headers.has(name)).toBe(false)
  })

  it("requires an injected runtime provider for Workers AI", () => {
    expect(() => createModelGateway(catalogOf("workers-ai"), undefined)).toThrow("needs a runtime Workers AI provider")
    const upstream = createModelGateway(catalogOf("mock"), undefined).model([...catalogOf("mock").models.values()][0]!)
    const provider = vi.fn(() => upstream)
    const catalog = catalogOf("workers-ai")
    expect(
      createModelGateway(catalog, undefined, { "workers-ai": provider }).model([...catalog.models.values()][0]!),
    ).toBe(upstream)
    expect(provider).toHaveBeenCalledWith("model-x")
  })

  it("refuses to start when the catalog lists a real provider and the gateway is not configured", () => {
    expect(() => createModelGateway(catalogOf("openai"), undefined)).toThrow("provider upstream needs the AI Gateway")
  })

  it("refuses to start on an openai-compatible provider it cannot reach yet", () => {
    expect(() => createModelGateway(catalogOf("openai-compatible"), config)).toThrow("no base URL")
  })
})

it("sends decrypted provider keys only to a complete AI Gateway", async () => {
  const requests: { url: string; headers: Headers }[] = []
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    requests.push({ url: input, headers: new Headers(init.headers) })
    return Response.json({ error: { message: "test refusal" } }, { status: 400 })
  })
  const catalog = catalogOf("openai")
  const keys = new Map([["upstream", "provider-test-key"]])
  expect(() => createModelGateway(catalog, undefined, {}, keys)).toThrow("needs the AI Gateway")
  await streamText({
    model: createModelGateway(catalog, config, {}, keys).model([...catalog.models.values()][0]!),
    prompt: "Hi",
    maxRetries: 0,
  }).consumeStream()
  expect(requests[0]?.url).toContain("gateway.ai.cloudflare.com")
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer provider-test-key")
  expect(requests[0]?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token")
})
