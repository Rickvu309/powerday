import type { Catalog, ModelGateway } from "@powerday/chat-core"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

const reply = ["This is the mock model. ", "Real providers arrive ", "with the gateway."]

const mockModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text" },
          ...reply.map((delta) => ({ type: "text-delta" as const, id: "text", delta })),
          { type: "text-end", id: "text" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: reply.length, text: reply.length, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  })

export const modelGateway: (env: Cloudflare.Env, catalog: Catalog) => ModelGateway = (_env, catalog) => ({
  model: (entry) => {
    if (catalog.providers.get(entry.provider)?.kind !== "mock") {
      throw new Error(`the gateway does not reach ${entry.provider} yet`)
    }
    return mockModel()
  },
})
