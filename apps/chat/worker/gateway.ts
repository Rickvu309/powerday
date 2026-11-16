import { createModelGateway, type Catalog, type ModelGateway } from "@powerday/chat-core"
import { createAI } from "agents/models/ai-sdk"

type GatewayEnv = Pick<Cloudflare.Env, "AI" | "AI_GATEWAY_NAME" | "AI_GATEWAY_ACCOUNT_ID" | "AI_GATEWAY_TOKEN">

export const modelGateway = (env: GatewayEnv, catalog: Catalog): ModelGateway => {
  const { AI_GATEWAY_ACCOUNT_ID: accountId, AI_GATEWAY_NAME: name, AI_GATEWAY_TOKEN: token } = env
  const workersAI = [...catalog.providers.values()].some((provider) => provider.kind === "workers-ai")
  if (workersAI && (!env.AI || !name)) throw new Error("Workers AI needs the AI binding and AI_GATEWAY_NAME")
  return createModelGateway(
    catalog,
    accountId && name && token ? { accountId, name, token } : undefined,
    workersAI && env.AI && name
      ? { "workers-ai": createAI({ binding: env.AI, id: name, collectLog: true }).languageModel }
      : {},
  )
}
