import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { stampChecked, workingTree } from "./checked.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const stages = [
  [
    ["format", "pnpm", ["exec", "oxfmt", "--check"]],
    ["lint", "pnpm", ["lint"]],
    ["workflows", "node", ["scripts/workflows.mjs"]],
    ["test", "pnpm", ["test:unit"]],
    ["tooling", "pnpm", ["test:tooling"]],
  ],
  [["typecheck", "pnpm", ["typecheck"]]],
  [["build", "pnpm", ["build"]]],
]

export const onCi = (env) => env.CI === "true" || env.CI === "1"

export const warnSteps = new Set()

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
  const checkedTree = onCi(process.env) ? undefined : workingTree(root)

  for (const stage of stages) {
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
