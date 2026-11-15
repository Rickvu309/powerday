import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = import.meta.dirname

const testsIn = (directory) =>
  fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => path.join(directory, name))

const rulesDirectory = path.join(root, "rules")
const files = [...testsIn(root), ...(fs.existsSync(rulesDirectory) ? testsIn(rulesDirectory) : [])]

const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { env: process.env })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("close", (status) => resolve({ status: status ?? 1, output }))
  })

let failed = false
for (const result of await Promise.all(files.map(run))) {
  process.stdout.write(result.output)
  if (result.status !== 0) failed = true
}
if (failed) process.exit(1)
