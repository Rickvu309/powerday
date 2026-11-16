import { expect, test } from "vitest"
import { unstable_readConfig } from "wrangler"
import { parseCatalog } from "@powerday/chat-core"

const config = unstable_readConfig({ config: "apps/chat/wrangler.jsonc" })

test("production config binds Cloudflare services on the chat domain", () => {
  expect(config.d1_databases).toContainEqual(expect.objectContaining({ binding: "DB", migrations_dir: "migrations" }))
  expect(config.ai).toMatchObject({ binding: "AI" })
  expect(config.send_email).toContainEqual({ name: "EMAIL" })
  expect(config.routes).toContainEqual({ pattern: "chat.powerday.work", custom_domain: true })
  expect(config.vars.AI_GATEWAY_NAME).toEqual(expect.any(String))
  expect(config.vars).not.toHaveProperty("ALLOWLIST_JSON")
  expect(config.vars).not.toHaveProperty("BETTER_AUTH_SECRET")
})

test("production catalog enables Workers AI models without provider keys", () => {
  const catalog = parseCatalog(config.vars.CATALOG)
  expect([...catalog.providers.values()].every((provider) => provider.kind === "workers-ai")).toBe(true)
  const enabled = [...catalog.models.values()].filter((model) => model.status === "enabled")
  expect(enabled.length).toBeGreaterThan(0)
  expect(enabled.every((model) => model.upstreamId.startsWith("@cf/"))).toBe(true)
})
