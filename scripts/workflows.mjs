import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const forkTriggers = new Set(["pull_request_target", "workflow_run"])

const triggersOf = (on) => (typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(on ?? {}))

export const workflowFindings = (name, source) => {
  const workflow = parse(source) ?? {}
  const findings = triggersOf(workflow.on)
    .filter((trigger) => forkTriggers.has(trigger))
    .map((trigger) => `${name}: ${trigger} hands this repo's secrets to code from a fork. Use pull_request.`)
  if (workflow.permissions === undefined) {
    findings.push(`${name}: set top-level permissions so the token gets only what the jobs need.`)
  }
  return findings
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.github/workflows")
  const findings = fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .flatMap((name) => workflowFindings(`.github/workflows/${name}`, fs.readFileSync(path.join(folder, name), "utf8")))
  for (const finding of findings) console.error(finding)
  if (findings.length > 0) process.exit(1)
}
