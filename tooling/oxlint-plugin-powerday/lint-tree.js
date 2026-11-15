import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { rawExtensions, rawFindings } from "./rules/no-raw.js"
import { scanSource, scannedExtensions } from "./scan-comments.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const lintPaths = [".github", "apps", "packages", "scripts", "tooling", "vitest.config.mts"].filter((relative) =>
  fs.existsSync(path.join(root, relative)),
)
const unlinted = ["apps/landing/src", "apps/landing/public"]
const skipDirectories = new Set(["node_modules", "dist", ".astro"])

const oxlint = spawnSync(
  "pnpm",
  [
    "exec",
    "oxlint",
    "--config",
    "tooling/oxlint-plugin-powerday/oxlintrc.json",
    ...unlinted.flatMap((folder) => ["--ignore-pattern", `${folder}/**`]),
    ...lintPaths,
  ],
  { cwd: root, encoding: "utf8", env: process.env },
)

if (oxlint.stdout) process.stdout.write(oxlint.stdout)
if (oxlint.stderr) process.stderr.write(oxlint.stderr)
if (oxlint.error) {
  console.error(oxlint.error.message)
  process.exit(1)
}

const filesUnder = (absolute) => {
  const relative = path.relative(root, absolute).split(path.sep).join("/")
  if (unlinted.includes(relative)) return []
  const info = fs.statSync(absolute, { throwIfNoEntry: false })
  if (!info || skipDirectories.has(path.basename(absolute))) return []
  if (!info.isDirectory()) return info.isFile() ? [absolute] : []
  return fs.readdirSync(absolute).flatMap((name) => filesUnder(path.join(absolute, name)))
}

const hits = []
for (const relativePath of lintPaths) {
  for (const file of filesUnder(path.resolve(root, relativePath))) {
    const relative = path.relative(root, file).split(path.sep).join("/")
    const extension = path.extname(file).toLowerCase()
    const comment = scannedExtensions.has(extension)
    const raw = rawExtensions.has(extension)
    if (!comment && !raw) continue
    const source = fs.readFileSync(file, "utf8")
    if (comment) hits.push(...(await scanSource(relative, source)))
    if (raw) {
      for (const finding of rawFindings(relative, source)) {
        hits.push(`${relative}:${finding.line}: ${finding.message}`)
      }
    }
  }
}

for (const item of hits) console.error(item)
if ((oxlint.status ?? 1) !== 0) process.exit(oxlint.status ?? 1)
if (hits.length > 0) process.exit(1)
