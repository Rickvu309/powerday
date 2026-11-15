import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pluginRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(pluginRoot, "../..")
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint")

if (!fs.existsSync(oxlint)) {
  throw new Error(`oxlint binary is missing at ${oxlint}`)
}

export const lintSource = (relativeName, source, rules) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-oxlint-"))
  try {
    const filePath = path.join(fixtureRoot, relativeName)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, source)
    const configPath = path.join(fixtureRoot, "oxlintrc.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        categories: {
          correctness: "off",
          suspicious: "off",
          pedantic: "off",
          perf: "off",
          style: "off",
          restriction: "off",
          nursery: "off",
        },
        jsPlugins: [{ name: "powerday", specifier: path.join(pluginRoot, "index.js") }],
        rules,
      }),
    )
    const result = spawnSync(oxlint, ["--config", configPath, "--format", "unix", filePath], {
      encoding: "utf8",
    })
    const failure = result.error ? result.error.message : ""
    return {
      status: result.status,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}${failure}`,
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

const queued = new Map()

const configFor = (rules) =>
  JSON.stringify({
    categories: {
      correctness: "off",
      suspicious: "off",
      pedantic: "off",
      perf: "off",
      style: "off",
      restriction: "off",
      nursery: "off",
    },
    jsPlugins: [{ name: "powerday", specifier: path.join(pluginRoot, "index.js") }],
    rules,
  })

const lintBatch = (rules, cases) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-oxlint-"))
  try {
    const files = cases.map((item, index) => {
      const filePath = path.join(fixtureRoot, `case-${String(index)}`, item.relativeName)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, item.source)
      return filePath
    })
    const configPath = path.join(fixtureRoot, "oxlintrc.json")
    fs.writeFileSync(configPath, configFor(rules))
    const result = spawnSync(oxlint, ["--config", configPath, "--format", "unix", ...files], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
    const everything = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`
    const lines = everything.split("\n")
    return files.map((filePath) => {
      const own = lines.filter((line) => line.startsWith(`${filePath}:`))
      return {
        failed: own.some((line) => line.includes("[Error")),
        output: result.status === 0 || result.status === 1 ? own.join("\n") : everything,
        broken: result.status !== 0 && result.status !== 1,
      }
    })
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

const settleQueue = () => {
  const problems = []
  for (const { rules, cases } of queued.values()) {
    const results = lintBatch(rules, cases)
    for (const [index, item] of cases.entries()) {
      const result = results[index]
      if (item.expected === undefined) {
        if (result.failed || result.broken) problems.push(`${item.name}\nexpected a pass\n${result.output}`)
      } else if (!result.failed || result.broken || !result.output.includes(item.expected)) {
        problems.push(`${item.name}\nexpected a failure containing ${JSON.stringify(item.expected)}\n${result.output}`)
      }
    }
  }
  queued.clear()
  if (problems.length > 0) throw new Error(problems.join("\n\n"))
}

const enqueue = (item, rules) => {
  const key = JSON.stringify(rules)
  const group = queued.get(key) ?? { rules, cases: [] }
  if (queued.size === 0) process.once("beforeExit", settleQueue)
  group.cases.push(item)
  queued.set(key, group)
}

export const expectRejects = (name, relativeName, source, rules, text) => {
  enqueue({ name, relativeName, source, expected: text }, rules)
}

export const expectAccepts = (name, relativeName, source, rules) => {
  enqueue({ name, relativeName, source }, rules)
}
