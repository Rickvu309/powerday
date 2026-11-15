import fs from "node:fs"
import { followPull } from "./land-follow.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}\n${JSON.stringify(actual, null, 1)}\n${JSON.stringify(expected, null, 1)}`)
  }
}
const fixture = (name) => fs.readFileSync(new URL(`./land-fixtures/${name}`, import.meta.url), "utf8")
const ok = (stdout) => ({ status: 0, stdout, stderr: "" })

const pass = [{ __typename: "CheckRun", name: "ci", conclusion: "SUCCESS", status: "COMPLETED" }]
const running = [{ __typename: "CheckRun", name: "ci", conclusion: null, status: "IN_PROGRESS" }]
const fail = [{ __typename: "CheckRun", name: "ci", conclusion: "FAILURE", status: "COMPLETED" }]

const answer = ({
  armed = true,
  entry = null,
  merged = false,
  contexts = pass,
  mergeable = "MERGEABLE",
  timeline = [],
} = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          state: merged ? "MERGED" : "OPEN",
          merged,
          baseRefName: "main",
          headRefOid: "aaaa1111",
          mergeable,
          mergeStateStatus: "CLEAN",
          isInMergeQueue: entry !== null,
          mergeQueueEntry: entry,
          autoMergeRequest: armed ? { enabledAt: "x", mergeMethod: "SQUASH" } : null,
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { nodes: contexts } } } }] },
          timelineItems: { nodes: timeline },
        },
        mergeQueue: { entries: { nodes: [] } },
      },
    },
  })

const queuedAt = (position) => answer({ entry: { position, state: "QUEUED" } })

const follow = async ({ reads, runs = [] }) => {
  const said = []
  const asked = []
  let clock = 0
  let at = 0
  const code = await followPull({
    number: 394,
    branch: "land-command",
    repository: "Rickvu309/powerday",
    read: () => reads[Math.min(at++, reads.length - 1)],
    gh: (args) => {
      asked.push(args.join(" "))
      if (args[0] === "run" && args[1] === "view") return ok(fixture("vitest-failed.log"))
      if (args[1]?.includes("/actions/workflows/ci.yml/runs")) return ok(JSON.stringify(runs))
      return ok("")
    },
    git: (args) => ({ status: 0, stdout: args[0] === "rev-list" ? "0\n" : "", stderr: "" }),
    sleep: (ms) => {
      clock += ms
    },
    now: () => clock,
    say: (line) => said.push(line),
    interval: 30000,
    graceMs: 120000,
    limitMs: 3600000,
  })
  return { code, said, asked }
}

const merged = await follow({
  reads: [answer({ contexts: running }), queuedAt(2), queuedAt(1), answer({ merged: true })],
})
same("a pull request that merges ends the follow with 0", merged.code, 0)
same("each state is said once, in order", merged.said, [
  "follow: checks are running (0 passed, 1 running); auto-merge is armed, and the queue takes it when checks pass",
  "follow: in the merge queue at position 2",
  "follow: in the merge queue at position 1",
  "follow: merged. pull request 394 is on main.",
])

const queueRun = {
  id: 43261070420,
  event: "merge_group",
  branch: "gh-readonly-queue/main/pr-394-19e91f75084914dca3801292183decf0304af526",
  head: "bbbb2222",
  conclusion: "failure",
  createdAt: "2026-11-12T16:30:00Z",
}
const dropped = await follow({ reads: [queuedAt(1), answer({ armed: false })], runs: [queueRun] })
same("a pull request the queue dropped ends the follow with 1", dropped.code, 1)
if (!dropped.said.includes("follow: dropped from the merge queue. The queue's own run failed:")) {
  throw new Error(`the drop is not said: ${dropped.said.join(" | ")}`)
}
if (!dropped.said.some((line) => line.includes("usage.test.ts"))) {
  throw new Error("the drop does not print the queue run's failed tests")
}

const removal = {
  __typename: "RemovedFromMergeQueueEvent",
  reason: "merge_conflict",
  createdAt: "2026-11-13T01:40:40Z",
}
const reasoned = await follow({
  reads: [queuedAt(1), answer({ armed: false, timeline: [{ __typename: "PullRequestCommit" }, removal] })],
  runs: [queueRun],
})
same(
  "a drop says the reason GitHub recorded",
  reasoned.said.includes("follow: the merge queue removed this head: merge_conflict (2026-11-13T01:40:40Z)"),
  true,
)

const removedBefore = await follow({
  reads: [
    answer({ contexts: running, timeline: [{ __typename: "PullRequestCommit" }, removal] }),
    answer({ merged: true }),
  ],
})
same(
  "a head the queue already removed says so while the follow starts",
  removedBefore.said[0].includes("the merge queue removed this head: merge_conflict"),
  true,
)

const red = await follow({
  reads: [answer({ contexts: fail })],
  runs: [{ ...queueRun, event: "pull_request", branch: "land-command", head: "aaaa1111" }],
})
same("a failing check ends the follow with 1", red.code, 1)
same(
  "and the job is never rerun",
  red.asked.some((line) => line.includes("rerun")),
  false,
)
if (!red.said.some((line) => line.includes("usage.test.ts"))) throw new Error("the failed tests are not printed")

const unqueued = await follow({ reads: [answer()] })
same("green, armed and never queued ends the follow with 1", unqueued.code, 1)
if (!unqueued.said.at(-1).includes("is green and has not entered the merge queue")) {
  throw new Error(`the stall is not said: ${unqueued.said.at(-1)}`)
}

const conflicting = await follow({ reads: [answer({ mergeable: "CONFLICTING", contexts: running })] })
same("a conflict ends the follow with 1", conflicting.code, 1)
if (!conflicting.said.at(-1).includes("git rebase origin/main"))
  throw new Error("the conflict does not name the rebase")

const waiting = await follow({ reads: [answer({ contexts: running })] })
same("a pull request that never merges stops at the limit", waiting.code, 1)
if (!waiting.said.at(-1).includes("not merged after 60 minutes"))
  throw new Error(`the limit is not said: ${waiting.said.at(-1)}`)
