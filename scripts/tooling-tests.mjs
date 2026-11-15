import { spawn } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const toolingTests = (folder) => [
  "tooling/oxlint-plugin-powerday/run-tests.js",
  ...readdirSync(path.join(folder, "scripts"))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => `scripts/${name}`),
]

const runOne = (test, cwd) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [test], { cwd })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("error", (error) => resolve({ test, status: 1, output: `${output}${error.message}\n` }))
    child.on("close", (status) => resolve({ test, status: status ?? 1, output }))
  })

export const runToolingTests = async (tests, { width = 4, cwd = root } = {}) => {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < tests.length) {
      const test = tests[next]
      next += 1
      results.push(await runOne(test, cwd))
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, tests.length) }, worker))
  return results.sort((left, right) => tests.indexOf(left.test) - tests.indexOf(right.test))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await runToolingTests(toolingTests(root))
  const failures = results.filter((result) => result.status !== 0)
  for (const failure of failures) {
    process.stderr.write(failure.output)
    console.error(`fail ${failure.test}`)
  }
  if (failures.length > 0) process.exit(1)
}
