import { App } from "@/app"
import { ModelChoice, modelChoice } from "../model-choice"

const choice = modelChoice(async () => {
  throw new Error("Catalog unavailable")
})

export default function ModelsFailed() {
  return (
    <ModelChoice.Provider value={choice}>
      <App />
    </ModelChoice.Provider>
  )
}
