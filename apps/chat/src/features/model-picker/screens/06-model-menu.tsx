import { ModelId, ProviderId, type ListedModel } from "@powerday/chat-core"
import { App } from "@/app"
import { ModelChoice, modelChoice } from "../model-choice"

const model = (id: string, label: string, capabilities: ListedModel["capabilities"]): ListedModel => ({
  id: ModelId.parse(id),
  provider: ProviderId.parse("mock"),
  label,
  capabilities,
  contextWindow: 8192,
})

const choice = modelChoice(async () => [
  model("mock-fast", "Mock Fast", { tools: false, vision: false, reasoning: false }),
  model("mock-vision", "Mock Vision", { tools: true, vision: true, reasoning: false }),
  model("mock-reasoning", "Mock Reasoning", { tools: true, vision: true, reasoning: true }),
])

export default function ModelMenu() {
  return (
    <ModelChoice.Provider value={choice}>
      <App />
    </ModelChoice.Provider>
  )
}
