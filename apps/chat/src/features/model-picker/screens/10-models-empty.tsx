import { App } from "@/app"
import { ModelChoice, modelChoice } from "../model-choice"

const choice = modelChoice(async () => [])

export default function ModelsState() {
  return (
    <ModelChoice.Provider value={choice}>
      <App />
    </ModelChoice.Provider>
  )
}
