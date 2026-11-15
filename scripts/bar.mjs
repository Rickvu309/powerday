import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const areas = JSON.parse(fs.readFileSync(new URL("./areas.json", import.meta.url), "utf8"))

export const lineLimit = 400

const guardedStarts = [".github/workflows/", "scripts/", "tooling/"]
const guardedFiles = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  ".node-version",
  ".oxfmtrc.json",
  "AGENTS.md",
  "CHECKS.md",
  "tsconfig.base.json",
  "vitest.config.mts",
  "playwright.config.ts",
])
const generatedStarts = ["apps/chat/src/components/ui/", "apps/chat/src/components/ai-elements/"]
const generatedNames = new Set(["pnpm-lock.yaml", "package-lock.json"])
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/

export const changesCi = (file) => guardedFiles.has(file) || guardedStarts.some((start) => file.startsWith(start))

export const generated = (file) =>
  generatedNames.has(file.slice(file.lastIndexOf("/") + 1)) || generatedStarts.some((start) => file.startsWith(start))

export const seen = (file) => {
  if (testFile.test(file) || generated(file)) return false
  if (file.startsWith("apps/chat/src/")) return /\.(?:tsx|css)$/.test(file)
  return file.startsWith("apps/landing/src/") || file.startsWith("apps/landing/public/")
}

export const hasBeforeAfter = (body) => {
  const lines = String(body ?? "").split(/\r?\n/)
  const start = lines.findIndex((line) => /^##[ \t]+before[ \t]*\/[ \t]*after\b/i.test(line))
  if (start === -1) return false
  const end = lines.findIndex((line, at) => at > start && /^##?[ \t]/.test(line))
  return /!\[[^\]]*\]\([^)\s]+\)|<img\s/i.test(lines.slice(start + 1, end === -1 ? undefined : end).join("\n"))
}

export const areasOf = (names) =>
  Object.entries(areas)
    .filter(([, starts]) => names.some((name) => starts.some((start) => name === start || name.startsWith(start))))
    .map(([area]) => area)

export const handWritten = (files) =>
  files.filter((file) => !generated(file.name)).reduce((sum, file) => sum + file.additions, 0)

export const managed = ["changes-ci", "needs-before-after", "over-400-lines", ...Object.keys(areas)]

export const verdict = ({ files, body }) => {
  const names = files.map((file) => file.name)
  const shown = names.filter(seen)
  const lines = handWritten(files)
  const labels = [
    ...(names.some(changesCi) ? ["changes-ci"] : []),
    ...(shown.length > 0 && !hasBeforeAfter(body) ? ["needs-before-after"] : []),
    ...(lines > lineLimit ? ["over-400-lines"] : []),
    ...areasOf(names),
  ]
  const said = [
    `${lines} hand-written lines added, limit ${lineLimit}. Lockfiles and generated shadcn files do not count.`,
    names.some(changesCi) ? "Changes what ci checks: the owner reads it." : "Leaves what ci checks alone.",
    shown.length === 0
      ? "Changes nothing a person sees."
      : `Changes what a person sees (${shown.slice(0, 3).join(", ")}${shown.length > 3 ? ` and ${shown.length - 3} more` : ""}). ${hasBeforeAfter(body) ? "Has" : "Needs"} a ## Before / after section with images.`,
    `Areas: ${areasOf(names).join(", ") || "none"}.`,
  ]
  return { labels, remove: managed.filter((label) => !labels.includes(label)), said }
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [repository, number] = process.argv.slice(2)
  const gh = (args) => execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  const pull = `repos/${repository}/pulls/${number}`
  const { body, current } = JSON.parse(gh([pull, "--jq", "{body, current: [.labels[].name]} | @json"]))
  const files = gh([`${pull}/files`, "--paginate", "--jq", ".[] | {name: .filename, additions} | @json"])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line))
  const result = verdict({ files, body })
  for (const line of result.said) console.log(line)
  if (process.argv.includes("--label")) {
    const issue = `repos/${repository}/issues/${number}/labels`
    for (const label of result.remove.filter((each) => current.includes(each)))
      gh(["-X", "DELETE", `${issue}/${label}`])
    if (result.labels.length > 0)
      gh(["-X", "POST", issue, ...result.labels.flatMap((label) => ["-f", `labels[]=${label}`])])
    console.log(`Labels: ${result.labels.join(", ") || "none"}.`)
  }
}
