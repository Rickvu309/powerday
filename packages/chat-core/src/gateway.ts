import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { simulateReadableStream, type LanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import type { Catalog, ModelEntry, Provider, ProviderKind } from "./catalog.js"

export type ModelGateway = {
  readonly model: (entry: ModelEntry, catalog?: Catalog) => LanguageModel | Promise<LanguageModel>
}

export type SyncModelGateway = { readonly model: (entry: ModelEntry) => LanguageModel }

export type GatewayConfig = {
  readonly accountId: string
  readonly name: string
  readonly token: string
}

type Upstream = (upstreamId: string) => LanguageModel

type Connect = (provider: Provider, config: GatewayConfig | undefined) => Upstream

type ProviderSettings = { readonly baseURL: string; readonly apiKey: string; readonly fetch: typeof fetch }

const keyStoredInGateway = "stored-in-gateway"

const providerKeyHeaders = ["authorization", "x-api-key", "x-goog-api-key"]

const withGatewayToken =
  (token: string): typeof fetch =>
  (input, init) => {
    const headers = new Headers(init?.headers)
    for (const name of providerKeyHeaders) headers.delete(name)
    headers.set("cf-aig-authorization", `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }

const throughGateway =
  (path: string, create: (settings: ProviderSettings) => Upstream): Connect =>
  (provider, config) => {
    if (config === undefined) {
      throw new Error(`provider ${provider.id} needs the AI Gateway account id, gateway name and token`)
    }
    return create({
      baseURL: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.name}/${path}`,
      apiKey: keyStoredInGateway,
      fetch: withGatewayToken(config.token),
    })
  }

const mockReply =
  "This is the mock model. It answers one word at a time so you can watch a reply stream in. " +
  "Real providers answer through the Cloudflare AI Gateway once the catalog lists them."

const mockModel: Upstream = () => {
  const words = mockReply.split(/(?<= )/)
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 30,
        chunks: [
          { type: "text-start", id: "text" },
          ...words.map((delta) => ({ type: "text-delta" as const, id: "text", delta })),
          { type: "text-end", id: "text" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: words.length, text: words.length, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  })
}

const connections = {
  mock: () => mockModel,
  openai: throughGateway("openai", createOpenAI),
  anthropic: throughGateway("anthropic/v1", createAnthropic),
  google: throughGateway("google-ai-studio/v1beta", createGoogleGenerativeAI),
  "workers-ai": (provider) => {
    throw new Error(`provider ${provider.id} needs a runtime Workers AI provider`)
  },
  "openai-compatible": (provider) => {
    throw new Error(`provider ${provider.id} is openai-compatible, and the catalog has no base URL for it yet`)
  },
} satisfies Record<ProviderKind, Connect>

export const createModelGateway = (
  catalog: Catalog,
  config: GatewayConfig | undefined,
  providers: Partial<Record<ProviderKind, Upstream>> = {},
  keys: ReadonlyMap<string, string> = new Map(),
): SyncModelGateway => {
  const keyed = (provider: Provider): Upstream | undefined => {
    const apiKey = keys.get(provider.id)
    if (apiKey === undefined) return undefined
    if (config === undefined)
      throw new Error(`provider ${provider.id} needs the AI Gateway account id, gateway name and token`)
    const root = `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.name}`
    const post: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set("cf-aig-authorization", `Bearer ${config.token}`)
      return fetch(input, { ...init, headers })
    }
    const settings = { apiKey, fetch: post }
    switch (provider.kind) {
      case "openai":
        return createOpenAI({ ...settings, baseURL: `${root}/openai` })
      case "anthropic":
        return createAnthropic({ ...settings, baseURL: `${root}/anthropic/v1` })
      case "google":
        return createGoogleGenerativeAI({ ...settings, baseURL: `${root}/google-ai-studio/v1beta` })
      case "openai-compatible": {
        if (provider.baseURL === undefined) throw new Error("Compatible provider needs a base URL")
        const url = new URL(provider.baseURL)
        const route =
          url.origin === "https://openrouter.ai"
            ? "openrouter"
            : url.origin === "https://api.deepseek.com"
              ? "deepseek"
              : `custom-${provider.id}`
        const baseURL = route.startsWith("custom-")
          ? `${root}/${route}${url.pathname.replace(/\/$/, "")}`
          : `${root}/${route}`
        const client = createOpenAI({ ...settings, baseURL })
        return (id) => client.chat(id)
      }
      default:
        return undefined
    }
  }
  const upstreams = new Map(
    [...catalog.providers.values()].map((provider) => [
      provider.id,
      providers[provider.kind] ?? keyed(provider) ?? connections[provider.kind](provider, config),
    ]),
  )
  return {
    model: (entry) => {
      const upstream = upstreams.get(entry.provider)
      if (upstream === undefined) throw new Error(`the gateway has no provider ${entry.provider}`)
      return upstream(entry.upstreamId)
    },
  }
}
