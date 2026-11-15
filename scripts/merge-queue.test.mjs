import { awaitChecks, enqueue, parsePull, queueLine, removalLine } from "./merge-queue.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}\n${JSON.stringify(actual, null, 1)}\n${JSON.stringify(expected, null, 1)}`)
  }
}

const answer = ({
  armed = false,
  entry = null,
  state = "OPEN",
  merged = false,
  contexts = [],
  others = [],
  timeline = [],
} = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 394,
          state,
          merged,
          baseRefName: "main",
          headRefOid: "d4e5f6a7b8c9",
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          isInMergeQueue: entry !== null,
          mergeQueueEntry: entry,
          autoMergeRequest: armed ? { enabledAt: "2026-11-12T10:00:00Z", mergeMethod: "SQUASH" } : null,
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { nodes: contexts } } } }] },
          timelineItems: { nodes: timeline },
        },
        mergeQueue: { entries: { nodes: others.map((number, at) => ({ position: at + 1, pullRequest: { number } })) } },
      },
    },
  })

const contexts = [
  { __typename: "CheckRun", name: "ci", conclusion: "SUCCESS", status: "COMPLETED" },
  { __typename: "CheckRun", name: "check (side)", conclusion: "FAILURE", status: "COMPLETED" },
  { __typename: "CheckRun", name: "browser", conclusion: null, status: "IN_PROGRESS" },
  { __typename: "CheckRun", name: "corpus", conclusion: "SKIPPED", status: "COMPLETED" },
  { __typename: "StatusContext", context: "legacy", state: "PENDING" },
]
const read = parsePull(answer({ contexts }))
same("checks are sorted into passed, failed and running", read.checks, {
  passed: ["ci", "corpus"],
  failed: ["check (side)"],
  running: ["browser", "legacy"],
})
same(
  "a pull request with no entry and no auto-merge is neither queued nor armed",
  [read.queued, read.armed],
  [false, false],
)
same("the head and base are read", [read.head, read.base, read.mergeable], ["d4e5f6a7b8c9", "main", "MERGEABLE"])

const queued = parsePull(answer({ armed: true, entry: { position: 2, state: "QUEUED" }, others: [401, 394] }))
same("a queue entry gives the position", [queued.queued, queued.position], [true, 2])
same("queue line says the position", queueLine(queued), "in the merge queue at position 2")
same(
  "armed line says the queue takes it when checks pass",
  queueLine(parsePull(answer({ armed: true }))),
  "auto-merge is armed, and the queue takes it when checks pass",
)
same(
  "an unqueued line says so plainly",
  queueLine(parsePull(answer())),
  "not in the merge queue and auto-merge is not armed",
)

const message = "the merge strategy for main is set by the merge queue"
const scripted = ({ merges, reads }) => {
  const asked = []
  let readAt = 0
  let mergeAt = 0
  return {
    asked,
    merge: (args) => {
      asked.push(args.join(" "))
      return merges[Math.min(mergeAt++, merges.length - 1)]
    },
    read: () => reads[Math.min(readAt++, reads.length - 1)],
  }
}

const stuck = scripted({
  merges: [
    { status: 0, stdout: "", stderr: `${message}\n` },
    { status: 0, stdout: "", stderr: `${message}\n` },
  ],
  reads: [answer({ others: [401] })],
})
const refused = enqueue({ merge: stuck.merge, read: stuck.read, repository: "Rickvu309/powerday", number: 394 })
same("pull request 394's output is not taken for a queued pull request", refused.ok, false)
same("both strategies were tried", stuck.asked, ["pr merge 394 --auto --squash", "pr merge 394 --auto"])
if (!refused.message.includes(message) || !refused.message.includes("pull request 394")) {
  throw new Error(`the failure does not quote what gh said and name the pull request: ${refused.message}`)
}

const second = scripted({
  merges: [
    { status: 0, stdout: "", stderr: `${message}\n` },
    { status: 0, stdout: "Auto-merge enabled", stderr: "" },
  ],
  reads: [answer(), answer({ armed: true })],
})
const retried = enqueue({ merge: second.merge, read: second.read, repository: "Rickvu309/powerday", number: 394 })
same("the second strategy arms it", [retried.ok, retried.state.armed], [true, true])

const first = scripted({ merges: [{ status: 0, stdout: "", stderr: "" }], reads: [answer({ armed: true })] })
same(
  "a pull request armed by the first try stops there",
  [enqueue({ merge: first.merge, read: first.read, repository: "r/r", number: 1 }).ok, first.asked.length],
  [true, 1],
)

const commit = { __typename: "PullRequestCommit" }
const removed = (reason, createdAt) => ({ __typename: "RemovedFromMergeQueueEvent", reason, createdAt })

const dropped = parsePull(
  answer({
    timeline: [
      commit,
      removed("merge_conflict", "2026-11-12T21:44:43Z"),
      { __typename: "AddedToMergeQueueEvent" },
      removed("invalid_merge_commit", "2026-11-13T01:40:40Z"),
    ],
  }),
)
same("the latest removal on the head is read", dropped.removal, {
  reason: "invalid_merge_commit",
  at: "2026-11-13T01:40:40Z",
})
same(
  "the removal line names the reason and the time",
  removalLine(dropped),
  "the merge queue removed this head: invalid_merge_commit (2026-11-13T01:40:40Z)",
)
same(
  "a removal before the latest push belongs to an old head",
  parsePull(answer({ timeline: [removed("merge_conflict", "2026-11-12T21:44:43Z"), commit] })).removal,
  undefined,
)
same(
  "a removal before a force push belongs to an old head",
  parsePull(
    answer({
      timeline: [removed("merge_conflict", "2026-11-12T21:44:43Z"), { __typename: "HeadRefForcePushedEvent" }],
    }),
  ).removal,
  undefined,
)
same(
  "leaving the queue by merging is not a removal",
  parsePull(answer({ timeline: [commit, removed("merged", "2026-11-13T02:03:23Z")] })).removal,
  undefined,
)
same("a pull request never removed has no removal", parsePull(answer()).removal, undefined)
same("and no removal line", removalLine(parsePull(answer())), undefined)

const waiting = async ({ reads, limitMs = 60000 }) => {
  const said = []
  let at = 0
  let clock = 0
  const state = await awaitChecks({
    read: () => reads[Math.min(at++, reads.length - 1)],
    repository: "Rickvu309/powerday",
    number: 394,
    sleep: (ms) => {
      clock += ms
    },
    now: () => clock,
    say: (line) => said.push(line),
    intervalMs: 10000,
    limitMs,
  })
  return { state, said, reads: () => at, clock: () => clock }
}
const started = [{ __typename: "CheckRun", name: "ci", conclusion: null, status: "IN_PROGRESS" }]

const early = await waiting({ reads: [answer(), answer(), answer({ contexts: started })] })
same("it waits until a check is on the head", [early.state.ok, early.reads(), early.clock()], [true, 3, 20000])
same("and says it is waiting", early.said.length > 0, true)

const never = await waiting({ reads: [answer()] })
same("it gives up when no check appears", never.state.ok, false)
if (!never.state.message.includes("no check has started")) {
  throw new Error(`the wait does not say why it stopped: ${never.state.message}`)
}

same("an armed pull request needs no wait", (await waiting({ reads: [answer({ armed: true })] })).reads(), 1)
same(
  "a queued pull request needs no wait",
  (await waiting({ reads: [answer({ entry: { position: 1, state: "QUEUED" } })] })).reads(),
  1,
)
