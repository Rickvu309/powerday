const colors = /\u001b\[[0-9;]*m/g
const githubPrefix = /^[^\t\n]*\t[^\t\n]*\t﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/

export const plainLog = (text) =>
  text
    .split("\n")
    .map((line) => line.replace(githubPrefix, "").replace(colors, ""))
    .join("\n")

export const failedSteps = (text) => {
  const lines = [...plainLog(text).matchAll(/^failed: (.+)$/gm)]
  return lines.length === 0
    ? []
    : lines
        .at(-1)[1]
        .split(",")
        .map((step) => step.trim())
}

const nextError = (lines, from) =>
  lines
    .slice(from)
    .find((line) => line.trim() !== "")
    ?.trim() ?? ""

const vitestFailure = /^ FAIL\s+(?:\S+\s+)??(\S+\.(?:test|spec)\.\w+)(?: > (.+?))?(?: \[ .+ \])?\s*$/
const playwrightFailure = /^\s+\d+\) (\S+\.spec\.\w+):\d+:\d+ › (.+?)\s*$/

export const failedTests = (text) => {
  const lines = plainLog(text).split("\n")
  const found = new Map()
  lines.forEach((line, at) => {
    const vitest = vitestFailure.exec(line)
    const playwright = playwrightFailure.exec(line)
    const [file, name] =
      vitest !== null ? [vitest[1], vitest[2]] : playwright !== null ? [playwright[1], playwright[2]] : []
    if (file === undefined) return
    const test = { file, name: name ?? "(the whole file)", error: nextError(lines, at + 1) }
    const key = `${file} ${test.name}`
    if (!found.has(key)) found.set(key, test)
  })
  return [...found.values()]
}

const queueBase = (branch) => /^gh-readonly-queue\/main\/pr-\d+-([0-9a-f]{40})$/.exec(branch)?.[1]

const mainWhenRunStarted = ({ repository, run, gh }) => {
  if (run.event === "merge_group") return queueBase(run.branch)
  const found = gh([
    "api",
    `repos/${repository}/commits?sha=main&until=${encodeURIComponent(run.createdAt)}&per_page=1`,
    "--jq",
    ".[0].sha",
  ])
  return found.status === 0 && found.stdout.trim() !== "" ? found.stdout.trim() : undefined
}

const snapshotLines = ({ repository, run, git, gh, files }) => {
  const then = mainWhenRunStarted({ repository, run, gh })
  if (then === undefined || git(["cat-file", "-e", `${then}^{commit}`]).status !== 0) {
    return [
      "could not tell whether main has moved since this run started. Run git fetch origin main, then land --status.",
    ]
  }
  const behind = Number(git(["rev-list", "--count", `${then}..origin/main`]).stdout.trim())
  if (behind === 0)
    return [
      "main has not moved since this run started. A rerun would test the same snapshot: fix the test or the code.",
    ]
  const changed = new Set(
    git(["diff", "--name-only", then, "origin/main"])
      .stdout.split("\n")
      .filter((line) => line !== ""),
  )
  const moved = `main has moved ${behind} ${behind === 1 ? "commit" : "commits"} since this run started`
  if (files.length === 0)
    return [`${moved}. Rebase before you try again: git fetch origin main && git rebase origin/main && pnpm land`]
  return files.map((file) =>
    changed.has(file)
      ? `${moved}, and ${file} changed on main since. A fix may have landed. Do not rerun the job: git fetch origin main && git rebase origin/main && pnpm land`
      : `${moved}, but ${file} did not change on main. A rerun would test the same code: fix the test or the code.`,
  )
}

export const ciFailureLines = ({ repository, run, gh, git }) => {
  const log = gh(["run", "view", String(run.id), "--repo", repository, "--log-failed"]).stdout
  const steps = failedSteps(log)
  const tests = failedTests(log)
  const lines = [
    `ci run ${run.id} (${run.event}) failed in ${steps.length > 0 ? steps.join(", ") : "a step that left no name"}.`,
  ]
  for (const test of tests) {
    lines.push(`  ${test.file}: ${test.name}`)
    if (test.error !== "") lines.push(`    ${test.error}`)
  }
  if (tests.length === 0)
    lines.push("  no failed test was named in the log. Read it with: gh run view " + run.id + " --log-failed")
  const files = [...new Set(tests.map((test) => test.file))]
  return [...lines, ...snapshotLines({ repository, run, git, gh, files })]
}
