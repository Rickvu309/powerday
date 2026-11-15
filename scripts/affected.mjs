import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const ownedBy = [
  ["tests/browser/", "apps/chat"],
  ["apps/", undefined],
  ["packages/", undefined],
]

const inert = [
  "docs/",
  "Assets/",
  "Exports/",
  "Motion/",
  "Styles/",
  "main.bl",
  "README.md",
  "AGENTS.md",
  "CHECKS.md",
  "CLAUDE.md",
  ".github/pull_request_template.md",
]

export const workspaceGraph = (folder = root) =>
  ["apps", "packages"].flatMap((parent) => {
    const at = path.join(folder, parent)
    if (!fs.existsSync(at)) return []
    return fs
      .readdirSync(at, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(at, entry.name, "package.json")))
      .map((entry) => {
        const manifest = JSON.parse(fs.readFileSync(path.join(at, entry.name, "package.json"), "utf8"))
        const uses = { ...manifest.dependencies, ...manifest.devDependencies }
        return {
          dir: `${parent}/${entry.name}`,
          name: manifest.name,
          uses: Object.keys(uses).filter((name) => String(uses[name]).startsWith("workspace:")),
        }
      })
  })

const workspaceOf = (file, graph) => {
  for (const [start, owner] of ownedBy) {
    if (!file.startsWith(start)) continue
    if (owner !== undefined) return owner
    const dir = file.split("/").slice(0, 2).join("/")
    return graph.some((workspace) => workspace.dir === dir) ? dir : null
  }
  return inert.some((start) => file === start || file.startsWith(start)) ? null : undefined
}

export const affected = ({ files, graph }) => {
  const changed = new Set()
  for (const file of files) {
    const dir = workspaceOf(file, graph)
    if (dir === undefined) return "all"
    if (dir !== null) changed.add(dir)
  }
  for (let grew = true; grew;) {
    grew = false
    for (const workspace of graph) {
      if (changed.has(workspace.dir)) continue
      const names = graph.filter((each) => changed.has(each.dir)).map((each) => each.name)
      if (workspace.uses.some((name) => names.includes(name))) {
        changed.add(workspace.dir)
        grew = true
      }
    }
  }
  return changed.size === graph.length ? "all" : [...changed].sort()
}

export const scopeFrom = (env) => {
  const value = (env.POWERDAY_ONLY ?? "").trim()
  if (value === "" || value === "all") return "all"
  if (value === "none") return []
  return value.split(/\s+/)
}

export const inScope = (scope, dir) => scope === "all" || scope.includes(dir)

export const scopeValue = (scope) => (scope === "all" ? "all" : scope.length === 0 ? "none" : scope.join(" "))

export const changedFiles = (base, head, cwd = root) =>
  execFileSync("git", ["diff", "--name-only", "--no-renames", base, head], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "")

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [base, head = "HEAD"] = process.argv.slice(2)
  const scope = base === undefined ? "all" : affected({ files: changedFiles(base, head), graph: workspaceGraph() })
  console.log(`only=${scopeValue(scope)}`)
  console.log(`browser=${inScope(scope, "apps/chat")}`)
}
