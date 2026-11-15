import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runToolingTests, toolingTests } from "./tooling-tests.mjs"

const same = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}\n${JSON.stringify(actual)}\n${JSON.stringify(expected)}`)
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-tooling-tests-"))
try {
  fs.mkdirSync(path.join(root, "scripts"))
  for (const name of ["zeta.test.mjs", "alpha.test.mjs", "alpha.mjs", "beta.test.ts"]) {
    fs.writeFileSync(path.join(root, "scripts", name), "")
  }
  same("the lint rule tests, then every script test in name order", toolingTests(root), [
    "tooling/oxlint-plugin-powerday/run-tests.js",
    "scripts/alpha.test.mjs",
    "scripts/zeta.test.mjs",
  ])
  fs.writeFileSync(path.join(root, "scripts", "new.test.mjs"), "")
  same("a new script test runs with no list to edit", toolingTests(root).includes("scripts/new.test.mjs"), true)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-tooling-run-"))
try {
  const scripts = {
    "slow.mjs": "await new Promise((resolve) => setTimeout(resolve, 200))\nconsole.log('slow ran')",
    "broken.mjs": "console.error('broken ran')\nprocess.exit(3)",
    "quick.mjs": "console.log('quick ran')",
  }
  for (const [name, source] of Object.entries(scripts)) fs.writeFileSync(path.join(folder, name), source)
  const results = await runToolingTests(["slow.mjs", "broken.mjs", "quick.mjs"], { width: 2, cwd: folder })
  same(
    "every script runs, results come back in the order listed, and a failing one keeps its output",
    results.map(({ test, status, output }) => [test, status, output.trim()]),
    [
      ["slow.mjs", 0, "slow ran"],
      ["broken.mjs", 3, "broken ran"],
      ["quick.mjs", 0, "quick ran"],
    ],
  )
} finally {
  fs.rmSync(folder, { recursive: true, force: true })
}
