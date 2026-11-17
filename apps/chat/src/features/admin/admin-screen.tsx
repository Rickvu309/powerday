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
  limits: [{ email: "", tokens: 100000, period: "month" }],
  users: [{ email: "person@example.com", tokens: 100000, period: "month" }],
  usage: [{ email: "person@example.com", model: "sample-model", today: 1200, week: 8400 }],
})
export function AdminScreen({
  phase = "ready",
  empty = false,
  confirm = false,
  editing,
  disable = false,
  longLabels = false,
}: {
  phase?: Phase
  empty?: boolean
  editing?: "provider" | "model"
  disable?: boolean
  longLabels?: boolean
  confirm?: boolean
}) {
  return (
    <main>
      <Admin
        initialData={
          empty
            ? { providers: [], models: [], keys: [], limits: [], usage: [], users: [] }
            : longLabels
              ? {
                  ...sample,
                  providers: sample.providers.map((p) => ({ ...p, label: "A".repeat(116) })),
                  models: sample.models.map((m) => ({ ...m, label: "B".repeat(116) })),
                }
              : sample
        }
        initialPhase={phase}
        demo
        confirm={confirm}
        disable={disable}
        {...(editing === undefined ? {} : { editing })}
      />
    </main>
  )
}
