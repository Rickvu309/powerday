import { createModelGateway, type Catalog, type ModelGateway } from "@powerday/chat-core"

export const modelGateway = (env: Cloudflare.Env, catalog: Catalog): ModelGateway => {
  const { AI_GATEWAY_ACCOUNT_ID: accountId, AI_GATEWAY_NAME: name, AI_GATEWAY_TOKEN: token } = env
  return createModelGateway(catalog, accountId && name && token ? { accountId, name, token } : undefined)
}
