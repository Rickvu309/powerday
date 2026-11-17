import {
  createModelGateway,
  type Catalog,
  type ModelGateway,
  type SyncModelGateway,
  type CatalogSource,
  type KeyVault,
} from "@powerday/chat-core"
import { createAI } from "agents/models/ai-sdk"

type GatewayEnv = Pick<Cloudflare.Env, "AI" | "AI_GATEWAY_NAME" | "AI_GATEWAY_ACCOUNT_ID" | "AI_GATEWAY_TOKEN">

export function modelGateway(
  env: GatewayEnv & { DB: D1Database },
  catalog: Catalog,
  source: CatalogSource,
  vault: KeyVault,
): ModelGateway
export function modelGateway(env: GatewayEnv, catalog: Catalog): SyncModelGateway
export function modelGateway(
  env: GatewayEnv & { DB?: D1Database },
  catalog: Catalog,
  source?: CatalogSource,
  vault?: KeyVault,
): ModelGateway {
  if (source !== undefined && vault !== undefined)
    return {
      model: async (entry, snapshot, secret) => {
        const current = snapshot ?? (await source.read())
        const provider = current.providers.get(entry.provider)
        const ciphertext = await env.DB?.prepare("SELECT ciphertext FROM provider_keys WHERE provider = ?")
          .bind(entry.provider)
          .first<string>("ciphertext")
        const keys = new Map<string, string>()
        if (ciphertext != null) {
          const key = await vault.open(ciphertext)
          secret?.(key)
          keys.set(entry.provider, key)
        }
        const subset = {
          providers: new Map(provider === undefined ? [] : [[provider.id, provider]]),
          models: current.models,
        }
        return buildGateway(env, subset, keys).model(entry)
      },
    }
  return buildGateway(env, catalog)
}

const buildGateway = (env: GatewayEnv, catalog: Catalog, keys = new Map<string, string>()): SyncModelGateway => {
  const { AI_GATEWAY_ACCOUNT_ID: accountId, AI_GATEWAY_NAME: name, AI_GATEWAY_TOKEN: token } = env
  const workersAI = [...catalog.providers.values()].some((provider) => provider.kind === "workers-ai")
  if (workersAI && !name) throw new Error("Workers AI needs AI_GATEWAY_NAME")
  return createModelGateway(
    catalog,
    accountId && name && token ? { accountId, name, token } : undefined,
    workersAI && name
      ? {
          "workers-ai": (upstreamId) => {
            if (!env.AI) throw new Error("Workers AI needs the AI binding")
            return createAI({ binding: env.AI, id: name, collectLog: true }).languageModel(upstreamId)
          },
        }
      : {},
    keys,
  )
}
