import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { affected, changedFiles, inScope, workspaceGraph } from "./affected.mjs"

export const workers = [
  { app: "landing", dir: "apps/landing" },
  { app: "chat", dir: "apps/chat", migrations: "apps/chat/migrations/" },
]

const changedApps = ({ files, graph }) => {
  const scope = files === undefined ? "all" : affected({ files, graph })
  return workers.filter(({ dir }) => inScope(scope, dir))
}

export const plan = ({ mode, enabled, hasToken, fork, files, graph }) => {
  const changed = changedApps({ files, graph })
  const named = changed.map(({ app }) => app).join(", ") || "none"
  const off = (why) => ({ apps: [], lines: [`${mode} skipped: ${why}. Changed apps: ${named}.`] })
  if (mode === "preview" && fork) return off("a pull request from a fork gets no preview and no secrets")
  if (enabled !== "true") return off("the repo variable DEPLOY_ENABLED is not true")
  if (!hasToken) return off("the secret CLOUDFLARE_API_TOKEN is not set")
  if (changed.length === 0) return off("no app changed")
  const lines = []
  const apps = []
  for (const worker of changed) {
    const migrates = worker.migrations !== undefined && (files ?? []).some((file) => file.startsWith(worker.migrations))
    if (mode === "preview" && migrates) {
      lines.push(
        `${worker.app}: no preview, because this pull request changes D1 migrations and a preview runs on the production database.`,
      )
    } else {
      lines.push(`${worker.app}: ${mode === "preview" ? "uploads a preview" : "deploys"}.`)
      apps.push(worker.app)
    }
  }
  return { apps, lines }
}

export const superseded = ({ app, files, graph }) => changedApps({ files, graph }).some((worker) => worker.app === app)

const readFiles = (base, head) => {
  if (base === undefined || /^0+$/.test(base)) return undefined
  try {
    return changedFiles(base, head)
  } catch {
    return undefined
  }
}

const write = (file, text) => (file ? fs.appendFileSync(file, `${text}\n`) : console.log(text))

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode === "superseded") {
    const [app] = rest
    const newer = superseded({ app, files: readFiles("HEAD", "origin/main") ?? [], graph: workspaceGraph() })
    write(process.env.GITHUB_OUTPUT, `superseded=${newer}`)
    if (newer)
      write(process.env.GITHUB_STEP_SUMMARY, `${app}: a newer commit on main changes it too, so its run deploys.`)
  } else {
    const [base, head = "HEAD"] = rest
    const result = plan({
      mode,
      enabled: process.env.DEPLOY_ENABLED,
      hasToken: process.env.HAS_TOKEN === "true",
      fork: process.env.FORK === "true",
      files: readFiles(base, head),
      graph: workspaceGraph(),
    })
    for (const line of result.lines) write(process.env.GITHUB_STEP_SUMMARY, line)
    write(process.env.GITHUB_OUTPUT, `apps=${JSON.stringify(result.apps)}`)
  }
}
