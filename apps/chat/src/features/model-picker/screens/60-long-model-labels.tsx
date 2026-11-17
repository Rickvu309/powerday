import { ModelId, ProviderId } from "@powerday/chat-core"
import { App } from "@/app"
import { ModelChoice, modelChoice } from "../model-choice"

const choice = modelChoice(async () =>
  [57, 200].map((length) => ({
    id: ModelId.parse(`research-${length}`),
    provider: ProviderId.parse("mock"),
    label:
      "Llama 3.3 70B Instruct — Multilingual Research Preview 2026 — International research with extended context, regional language support, tools and reasoning for release planning and accessibility evaluation".slice(
        0,
        length,
      ),
    capabilities: { tools: true, vision: true, reasoning: true },
    contextWindow: 32768,
  })),
)

export default function LongModelLabels() {
  return (
    <ModelChoice.Provider value={choice}>
      <App />
    </ModelChoice.Provider>
  )
}
