import { AdminOverview } from "@powerday/chat-core"
import { Admin, type Phase } from "./admin"

const sample = AdminOverview.parse({
  providers: [{ id: "openai", kind: "openai", label: "OpenAI" }],
  models: [
    {
      id: "sample-model",
      provider: "openai",
      label: "Sample model",
      upstreamId: "sample-model",
      price: "sample-model",
      status: "enabled",
      capabilities: { tools: true, vision: false, reasoning: false },
      contextWindow: 128000,
    },
  ],
  keys: [{ provider: "openai", suffix: "…abcd", updatedAt: 1794916800000 }],
  limits: [{ email: "", tokens: 100000 }],
  usage: [{ email: "person@example.com", model: "sample-model", today: 1200, week: 8400 }],
})
export function AdminScreen({
  phase = "ready",
  empty = false,
  confirm = false,
  editing,
}: {
  phase?: Phase
  empty?: boolean
  editing?: "provider" | "model"
  confirm?: boolean
}) {
  return (
    <main>
      <Admin
        initialData={empty ? { providers: [], models: [], keys: [], limits: [], usage: [] } : sample}
        initialPhase={phase}
        demo
        confirm={confirm}
        {...(editing === undefined ? {} : { editing })}
      />
    </main>
  )
}
