import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { scopeFrom } from "./affected.mjs"
import { stampChecked, workingTree } from "./checked.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const filters = (scope) => (scope === "all" ? [] : scope.flatMap((dir) => ["--filter", `./${dir}`]))

export const stagesFor = (scope) => {
  const scoped = (step) => (scope === "all" || scope.length > 0 ? [step] : [])
  return [
    [
      ["format", "pnpm", ["exec", "oxfmt", "--check"]],
      ["lint", "pnpm", ["lint"]],
      ["workflows", "node", ["scripts/workflows.mjs"]],
      ["actionlint", "node", ["scripts/actionlint.mjs"]],
      ["boundaries", "node", ["scripts/boundaries.mjs"]],
      ...scoped(["test", "pnpm", ["test:unit", ...(scope === "all" ? [] : scope)]]),
      ["tooling", "pnpm", ["test:tooling"]],
    ],
    scoped(["typecheck", "pnpm", ["typecheck"]]),
    scoped(["build", "pnpm", ["-r", "--if-present", ...filters(scope), "run", "build"]]),
  ].filter((stage) => stage.length > 0)
}

export const stages = stagesFor("all")

export const onCi = (env) => env.CI === "true" || env.CI === "1"

export const warnSteps = new Set(["boundaries", "actionlint"])

export const recordFailure = (failed, name, warned = warnSteps) => {
  if (warned.has(name)) return "warn"
  failed.push(name)
  return "fail"
}

const all = process.argv.includes("--all")
const failed = []

const run = ([name, command, args]) =>
  new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(command, args, { cwd: root, env: process.env })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    const finish = (status) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      if (status !== 0) {
        process.stderr.write(`${output}${recordFailure(failed, name)} ${name} ${seconds}s\n`)
      } else {
        process.stdout.write(`ok ${name} ${seconds}s\n`)
      }
      resolve()
    }
    child.on("error", (error) => {
      output += `${error.message}\n`
      finish(1)
    })
    child.on("close", (status) => finish(status ?? 1))
  })

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scope = scopeFrom(process.env)
  const checkedTree = onCi(process.env) || scope !== "all" ? undefined : workingTree(root)
  if (scope !== "all") console.log(`only ${scope.length === 0 ? "the steps every change needs" : scope.join(", ")}`)

  for (const stage of stagesFor(scope)) {
    await Promise.all(stage.map(run))
    if (failed.length > 0 && !all) break
  }

  if (failed.length > 0) {
    console.error(`failed: ${failed.join(", ")}`)
    process.exit(1)
  }
  if (checkedTree !== undefined) {
    stampChecked(root, checkedTree)
    console.log(`checked ${checkedTree.slice(0, 8)}: a commit with exactly these files may be pushed`)
  }
}
