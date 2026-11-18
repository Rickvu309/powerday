import { ModelId, ProviderId, type ListedModel } from "@powerday/chat-core"
import { useEffect, useMemo } from "react"
import { App } from "@/app"
import { ModelChoice, modelChoice } from "../model-choice"

const model = (id: string, label: string, reasoning: boolean): ListedModel => ({
  id: ModelId.parse(id),
  provider: ProviderId.parse("workers-ai"),
  label,
  capabilities: { tools: true, vision: false, reasoning },
  contextWindow: 131072,
})

const llama = model("llama-3-3-70b", "Llama 3.3 70B Instruct", false)
const qwen = model("qwen-3-32b", "Qwen 3 32B", false)
const deepseek = model("deepseek-r2", "DeepSeek R2 Reasoner", true)
const long = model(
  "llama-3-3-70b-research",
  "Llama 3.3 70B Instruct, multilingual research preview with 128k context",
  false,
)

type Fixture = { load: () => Promise<readonly ListedModel[]>; chosen?: ListedModel; open?: boolean }

const never = () => new Promise<readonly ListedModel[]>(() => {})

const groups: readonly (readonly [string, readonly (readonly [string, Fixture])[]])[] = [
  [
    "Data",
    [
      ["loading", { load: never }],
      ["failed", { load: () => Promise.reject(new Error("GET /api/models answered 503")) }],
      ["empty", { load: async () => [] }],
    ],
  ],
  [
    "Choice",
    [
      ["instant", { load: async () => [llama, qwen, deepseek], chosen: llama }],
      ["medium", { load: async () => [llama, qwen, deepseek], chosen: deepseek }],
      ["no-reasoning-model", { load: async () => [llama, qwen], chosen: llama }],
      ["long-model-name", { load: async () => [long, deepseek], chosen: long }],
    ],
  ],
  [
    "Open",
    [
      ["instant-open", { load: async () => [llama, qwen, deepseek], chosen: llama, open: true }],
      ["medium-open", { load: async () => [llama, qwen, deepseek], chosen: deepseek, open: true }],
      ["no-reasoning-open", { load: async () => [llama, qwen], chosen: llama, open: true }],
    ],
  ],
]

const fixtures = new Map(groups.flatMap(([, states]) => states))

export default function ThinkingEffortStates() {
  const state = new URLSearchParams(location.search).get("__state") ?? "instant"
  const fixture = fixtures.get(state) ?? fixtures.get("instant")!
  const choice = useMemo(() => {
    const store = modelChoice(fixture.load)
    void store.reload().then(() => {
      if (fixture.chosen) store.choose(fixture.chosen.id)
    })
    return store
  }, [fixture])
  useEffect(() => {
    if (!fixture.open) return
    const open = () => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Model:"]')
      if (!trigger) return false
      trigger.click()
      return true
    }
    if (open()) return
    const observer = new MutationObserver(() => {
      if (open()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [fixture])
  return (
    <>
      <ModelChoice.Provider value={choice}>
        <App />
      </ModelChoice.Provider>
      <nav
        aria-label="States"
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          zIndex: 1000,
          font: "12px/1.4 monospace",
          background: "lightyellow",
          border: "1px solid black",
          padding: 8,
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        {groups.map(([group, states]) => (
          <div key={group} style={{ marginBottom: 6 }}>
            <strong>{group}</strong>
            {states.map(([name]) => (
              <div key={name}>
                <a
                  href={`?__state=${name}`}
                  aria-current={name === state ? "page" : undefined}
                  style={{ color: "black", fontWeight: name === state ? 700 : 400 }}
                >
                  {name === state ? "> " : ""}
                  {name}
                </a>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </>
  )
}
