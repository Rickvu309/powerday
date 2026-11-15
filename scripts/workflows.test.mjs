import { workflowFindings } from "./workflows.mjs"

const safe = "on:\n  pull_request:\n  push:\n    branches: [main]\npermissions:\n  contents: read\n"
const cases = [
  ["a pull_request workflow with permissions passes", safe, 0],
  ["pull_request_target is refused", "on: pull_request_target\npermissions: {}\n", 1],
  ["workflow_run is refused", "on:\n  workflow_run:\n    workflows: [ci]\npermissions: {}\n", 1],
  ["a list of triggers is read", "on: [push, pull_request_target]\npermissions: {}\n", 1],
  ["a workflow with no permissions is refused", "on: pull_request\n", 1],
]
for (const [name, source, count] of cases) {
  const findings = workflowFindings("ci.yml", source)
  if (findings.length !== count) throw new Error(`${name}\n${findings.join("\n")}`)
}
