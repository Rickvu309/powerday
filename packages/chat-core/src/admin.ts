import * as z from "zod"
import { ModelId, ProviderId, PriceId, CatalogConfig, parseCatalog, type Catalog } from "./catalog.js"
import type { UserId } from "./ids.js"

const label = z.string().trim().min(1).max(120)
export const AdminProvider = z
  .strictObject({
    id: ProviderId,
    kind: z.enum(["openai", "anthropic", "google", "openai-compatible"]),
    label,
    baseURL: z.url().max(2048).optional(),
  })
  .refine((p) => p.kind !== "openai-compatible" || p.baseURL?.startsWith("https://"), "Use an HTTPS base URL")
export const AdminModel = z.strictObject({
  id: ModelId,
  provider: ProviderId,
  label,
  upstreamId: z.string().trim().min(1).max(200),
  status: z.enum(["enabled", "disabled"]),
  capabilities: z.strictObject({ tools: z.boolean(), vision: z.boolean(), reasoning: z.boolean() }),
  contextWindow: z.int().min(1).max(10000000),
  price: PriceId,
})
export const AdminMutation = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("provider"),
    provider: AdminProvider,
    key: z.string().min(8).max(4096).optional(),
  }),
  z.strictObject({ action: z.literal("remove-provider"), id: ProviderId }),
  z.strictObject({ action: z.literal("model"), model: AdminModel }),
  z.strictObject({ action: z.literal("remove-model"), id: ModelId }),
  z.strictObject({
    action: z.literal("limit"),
    email: z.email().max(254).toLowerCase().optional(),
    tokens: z.int().min(0).max(1000000000).nullable(),
  }),
])
export type AdminMutation = z.infer<typeof AdminMutation>
export type KeyVault = { seal: (key: string) => Promise<string>; open: (sealed: string) => Promise<string> }
export type AdminAccess = {
  page?: ((request: Request) => Promise<Response>) | undefined
  email: (user: UserId) => Promise<string | undefined>
}
export type CatalogSource = { read: () => Promise<Catalog> }
export type AdminStore = {
  overview: (now: Date) => Promise<unknown>
  mutate: (input: AdminMutation, actor: string, at: Date, id: string) => Promise<void>
}
export const catalogData = (catalog: Catalog) => ({
  providers: [...catalog.providers.values()],
  models: [...catalog.models.values()],
})
export { parseCatalog }

export const AdminOverview = CatalogConfig.extend({
  keys: z.array(z.object({ provider: z.string(), suffix: z.string(), updatedAt: z.number() })),
  limits: z.array(z.object({ email: z.string(), tokens: z.number() })),
  usage: z.array(z.object({ email: z.string(), model: z.string(), today: z.number(), week: z.number() })),
})
export type AdminOverview = z.infer<typeof AdminOverview>
