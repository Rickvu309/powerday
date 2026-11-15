import type { LanguageModel } from "ai"
import type { ModelEntry } from "./catalog.js"

export type ModelGateway = {
  readonly model: (entry: ModelEntry) => LanguageModel
}
