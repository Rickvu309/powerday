import * as z from "zod"

const slug = /^[a-z0-9][a-z0-9.-]{0,63}$/

export const ProviderId = z.string().regex(slug).brand("ProviderId")
export type ProviderId = z.infer<typeof ProviderId>

export const ModelId = z.string().regex(slug).brand("ModelId")
export type ModelId = z.infer<typeof ModelId>

export const PriceId = z.string().regex(slug).brand("PriceId")
export type PriceId = z.infer<typeof PriceId>

const ProviderKind = z.enum(["openai", "anthropic", "google", "openai-compatible", "workers-ai", "mock"])
export type ProviderKind = z.infer<typeof ProviderKind>

const Provider = z.strictObject({ id: ProviderId, kind: ProviderKind, label: z.string().min(1) }).readonly()
export type Provider = z.infer<typeof Provider>

const ModelEntry = z
  .strictObject({
    id: ModelId,
    provider: ProviderId,
    upstreamId: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["enabled", "disabled"]),
    capabilities: z.strictObject({ tools: z.boolean(), vision: z.boolean(), reasoning: z.boolean() }).readonly(),
    contextWindow: z.int().positive(),
    price: PriceId,
  })
  .readonly()
export type ModelEntry = z.infer<typeof ModelEntry>

export type Catalog = {
  readonly providers: ReadonlyMap<ProviderId, Provider>
  readonly models: ReadonlyMap<ModelId, ModelEntry>
}

const CatalogConfig = z.strictObject({ providers: z.array(Provider), models: z.array(ModelEntry) })

export const parseCatalog = (raw: unknown): Catalog => {
  const config = CatalogConfig.parse(raw)
  const providers = new Map(config.providers.map((provider) => [provider.id, provider]))
  const models = new Map(config.models.map((model) => [model.id, model]))
  if (providers.size !== config.providers.length) throw new Error("catalog lists a provider id twice")
  if (models.size !== config.models.length) throw new Error("catalog lists a model id twice")
  const orphan = config.models.find((model) => !providers.has(model.provider))
  if (orphan !== undefined) {
    throw new Error(`model ${orphan.id} names provider ${orphan.provider}, which the catalog does not list`)
  }
  return { providers, models }
}

export type ListedModel = Pick<ModelEntry, "id" | "provider" | "label" | "capabilities" | "contextWindow">

export const listModels = (catalog: Catalog): ListedModel[] =>
  [...catalog.models.values()]
    .filter((model) => model.status === "enabled")
    .map(({ id, provider, label, capabilities, contextWindow }) => ({
      id,
      provider,
      label,
      capabilities,
      contextWindow,
    }))
