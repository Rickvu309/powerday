import { describe, expect, it } from "vitest"
import { listModels, parseCatalog, type ModelId } from "./catalog.js"
import { catalogConfig } from "./catalog.fixture.js"

const [fast, retired] = catalogConfig.models

describe("parseCatalog", () => {
  it("keys providers and models by id", () => {
    const catalog = parseCatalog(catalogConfig)
    expect([...catalog.providers.keys()]).toEqual(["mock"])
    expect(catalog.models.get("mock-fast" as ModelId)?.upstreamId).toBe("upstream-fast")
  })

  it("refuses a model whose provider the catalog does not list", () => {
    const config = { ...catalogConfig, models: [{ ...fast, provider: "openai" }] }
    expect(() => parseCatalog(config)).toThrow("model mock-fast names provider openai")
  })

  it("refuses a model id listed twice", () => {
    expect(() => parseCatalog({ ...catalogConfig, models: [fast, fast] })).toThrow("model id twice")
  })

  it("refuses an unknown provider kind and an unknown field", () => {
    expect(() => parseCatalog({ ...catalogConfig, providers: [{ id: "x", kind: "azure", label: "X" }] })).toThrow()
    expect(() => parseCatalog({ ...catalogConfig, models: [{ ...fast, apiKey: "secret" }] })).toThrow()
  })
})

describe("listModels", () => {
  it("lists only enabled models, without upstream ids, prices or status", () => {
    expect(listModels(parseCatalog(catalogConfig))).toEqual([
      {
        id: fast?.id,
        provider: "mock",
        label: fast?.label,
        capabilities: fast?.capabilities,
        contextWindow: fast?.contextWindow,
      },
    ])
    expect(retired?.status).toBe("disabled")
  })
})
