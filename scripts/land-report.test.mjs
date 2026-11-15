import fs from "node:fs"
import { ciFailureLines, failedSteps, failedTests, plainLog } from "./land-report.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}\n${JSON.stringify(actual, null, 1)}\n${JSON.stringify(expected, null, 1)}`)
  }
}
const fixture = (name) => fs.readFileSync(new URL(`./land-fixtures/${name}`, import.meta.url), "utf8")
const ok = (stdout) => ({ status: 0, stdout, stderr: "" })

const queueRun = {
  id: 43261070420,
  event: "merge_group",
  branch: "gh-readonly-queue/main/pr-400-19e91f75084914dca3801292183decf0304af526",
  createdAt: "2026-11-12T16:30:00Z",
}
const oneFile = "packages/chat-core/src/usage.test.ts"

const lines = (changedOnMain, behind = 3) => {
  const gitCalls = []
  const out = ciFailureLines({
    repository: "Rickvu309/powerday",
    run: queueRun,
    gh: (args) => {
      if (args[0] === "run" && args[1] === "view") return ok(fixture("vitest-failed.log"))
      throw new Error(`unexpected gh ${args.join(" ")}`)
    },
    git: (args) => {
      gitCalls.push(args.join(" "))
      if (args[0] === "rev-list") return ok(`${behind}\n`)
      if (args[0] === "diff") return ok(changedOnMain.join("\n") + "\n")
      if (args[0] === "cat-file") return ok("")
      throw new Error(`unexpected git ${args.join(" ")}`)
    },
  })
  return { out, gitCalls }
}

const fixed = lines([oneFile, "README.md"])
same("the run is named with its failed step", fixed.out[0], "ci run 43261070420 (merge_group) failed in test.")
same(
  "each failed test is named with its first error",
  fixed.out[1],
  `  ${oneFile}: usage > refuses a turn over the daily limit`,
)
same("the first error line follows", fixed.out[2], "    AssertionError: expected 'allowed' to be 'refused'")
same(
  "main moved and the file changed there: say rebase",
  fixed.out.includes(
    `main has moved 3 commits since this run started, and ${oneFile} changed on main since. A fix may have landed. Do not rerun the job: git fetch origin main && git rebase origin/main && pnpm land`,
  ),
  true,
)
same(
  "the run's main is the base in the queue branch's name",
  fixed.gitCalls.includes("rev-list --count 19e91f75084914dca3801292183decf0304af526..origin/main"),
  true,
)

const unchanged = lines(["README.md"])
same(
  "main moved but the file did not change: say so",
  unchanged.out.includes(
    `main has moved 3 commits since this run started, but ${oneFile} did not change on main. A rerun would test the same code: fix the test or the code.`,
  ),
  true,
)

const still = lines([], 0)
same(
  "main has not moved: a rerun would test the same snapshot",
  still.out.includes(
    "main has not moved since this run started. A rerun would test the same snapshot: fix the test or the code.",
  ),
  true,
)

const plain = plainLog(fixture("vitest-failed.log"))
if (/\u001b|\d{4}-\d\d-\d\dT/.test(plain)) throw new Error("a CI line kept its job, time or colors")
same("a CI line keeps its words", plain.includes("fail test 2.2s"), true)
same("several failed steps are all named", failedSteps("failed: test, typecheck\n"), ["test", "typecheck"])
same("a log with no failure names nothing", failedTests("ok lint 1.2s\nok test 3.4s\n"), [])
same(
  "a whole file that failed to load is named without a test",
  failedTests(" FAIL  packages/x/src/y.test.ts [ packages/x/src/y.test.ts ]\nError: Cannot find module 'z'\n"),
  [{ file: "packages/x/src/y.test.ts", name: "(the whole file)", error: "Error: Cannot find module 'z'" }],
)
same(
  "a failed browser test is named with its file and first error",
  failedTests(
    "  1) tests/browser/shell.spec.ts:12:3 › the shell loads\n\n    Error: expect(received).toBe(expected)\n",
  ),
  [{ file: "tests/browser/shell.spec.ts", name: "the shell loads", error: "Error: expect(received).toBe(expected)" }],
)
