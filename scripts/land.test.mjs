import fs from "node:fs"
import { land, parseArgs } from "./land.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}\n${JSON.stringify(actual, null, 1)}\n${JSON.stringify(expected, null, 1)}`)
  }
}
const fixture = (name) => fs.readFileSync(new URL(`./land-fixtures/${name}`, import.meta.url), "utf8")
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" })
const no = (stderr = "", status = 1) => ({ status, stdout: "", stderr })

const checkRun = [{ __typename: "CheckRun", name: "ci", conclusion: null, status: "IN_PROGRESS" }]

const pullAnswer = ({
  armed = false,
  entry = null,
  merged = false,
  contexts = checkRun,
  base = "main",
  timeline = [],
} = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          state: merged ? "MERGED" : "OPEN",
          merged,
          baseRefName: base,
          headRefOid: "aaaa1111",
          mergeable: "MERGEABLE",
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

const harness = (options = {}) => {
  const {
    args = [],
    dirty = "",
    branch = "land-command",
    pull = {
      number: 394,
      baseRefName: "main",
      url: "https://github.com/Rickvu309/powerday/pull/394",
      title: "Add pnpm land",
      body: "## Proof\n\nRan it.\n",
    },
    bodyText = "## What changes\n\nA.\n\n## Proof\n\nRan it.\n",
    conflicts = "",
    behind = "0",
    checkStatus = 0,
    pushed = ok(),
    merges = [ok()],
    reads = [pullAnswer({ armed: true }), pullAnswer({ merged: true })],
  } = options
  const log = []
  const said = []
  let readAt = 0
  let mergeAt = 0
  const git = (command) => {
    log.push(`git ${command.join(" ")}`)
    const [name] = command
    if (name === "rev-parse") return ok(`${branch}\n`)
    if (name === "status") return ok(dirty)
    if (name === "fetch") return ok()
    if (name === "merge-tree")
      return conflicts === "" ? ok("tree\n") : { status: 1, stdout: `tree\n${conflicts}\n\nCONFLICT\n`, stderr: "" }
    if (name === "rev-list") return ok(`${behind}\n`)
    if (name === "push") return pushed
    if (name === "cat-file") return ok()
    if (name === "diff") return ok("")
    throw new Error(`unexpected ${command.join(" ")}`)
  }
  const gh = (command) => {
    log.push(`gh ${command.join(" ")}`)
    if (command[0] === "repo") return ok("Rickvu309/powerday\n")
    if (command[0] === "pr" && command[1] === "list") return ok(pull === null ? "[]" : JSON.stringify([pull]))
    if (command[0] === "pr" && command[1] === "view") return ok(JSON.stringify(pull))
    if (command[0] === "pr" && command[1] === "create") return ok("https://github.com/Rickvu309/powerday/pull/394\n")
    if (command[0] === "pr" && command[1] === "merge") return merges[Math.min(mergeAt++, merges.length - 1)]
    if (command[0] === "run" && command[1] === "view") return ok(fixture("vitest-failed.log"))
    if (command[1]?.includes("/actions/workflows/")) return ok("[]")
    throw new Error(`unexpected ${command.join(" ")}`)
  }
  let clock = 0
  const context = {
    args: parseArgs(args),
    git,
    gh,
    read: () => pullReads(),
    check: async () => {
      log.push("check")
      return { status: checkStatus }
    },
    readText: (file) => {
      log.push(`read ${file}`)
      if (bodyText === null) throw new Error(`ENOENT: no such file, open '${file}'`)
      return bodyText
    },
    sleep: (ms) => {
      clock += ms
    },
    now: () => clock,
    say: (line) => said.push(line),
  }
  const pullReads = () => reads[Math.min(readAt++, reads.length - 1)]
  return { context, log, said, run: () => land(context) }
}

const clean = harness()
same("a clean branch lands and follows to merged", await clean.run(), 0)
same(
  "the push uses a lease",
  clean.log.some((line) => line.startsWith("git push --force-with-lease")),
  true,
)
same(
  "the check runs before the push",
  clean.log.indexOf("check") < clean.log.findIndex((line) => line.startsWith("git push")),
  true,
)
same(
  "a failed step stops nothing here: every step said one line",
  clean.said.filter((line) => /^(branch|fetch|base|conflicts|check|push|pull request|queue|follow)/.test(line))
    .length >= 7,
  true,
)

const conflicted = harness({ conflicts: "apps/chat/src/app.tsx" })
same("a branch that conflicts with main stops before the check", await conflicted.run(), 1)
same("and runs no check", conflicted.log.includes("check"), false)
same(
  "and names the file and the rebase",
  conflicted.said.some((line) => line.includes("apps/chat/src/app.tsx") && line.includes("git rebase origin/main")),
  true,
)

const wrongBase = harness({ pull: { number: 403, baseRefName: "feat/chat-ui", url: "u" } })
same("a pull request against another branch stops", await wrongBase.run(), 1)
same(
  "and names the fix",
  wrongBase.said.some((line) => line.includes("gh pr edit 403 --base main")),
  true,
)
same(
  "and pushes nothing",
  wrongBase.log.some((line) => line.startsWith("git push")),
  false,
)

const red = harness({ checkStatus: 1 })
same("a failed check stops the land", await red.run(), 1)
same(
  "and pushes nothing",
  red.log.some((line) => line.startsWith("git push")),
  false,
)
same("and runs the check once, with no rerun", red.log.filter((line) => line === "check").length, 1)

const queueText = "the merge strategy for main is set by the merge queue"
const unqueued = harness({
  merges: [{ status: 0, stdout: "", stderr: `${queueText}\n` }],
  reads: [pullAnswer()],
})
same("a pull request gh left unqueued is a loud failure", await unqueued.run(), 1)
same(
  "and quotes what gh said",
  unqueued.said.some((line) => line.includes(queueText)),
  true,
)

const dirty = harness({ dirty: " M scripts/land.mjs\n" })
same("uncommitted files stop the land", await dirty.run(), 1)

const checkOnly = harness({ args: ["--check"] })
same("--check stops after the check", await checkOnly.run(), 0)
same(
  "and pushes nothing",
  checkOnly.log.some((line) => line.startsWith("git push")),
  false,
)

const noPull = harness({ pull: null })
same("no pull request and no title stops after the push with the command", await noPull.run(), 1)
same(
  "and says how to open one against main",
  noPull.said.some((line) => line.includes("gh pr create --base main")),
  true,
)

const created = harness({ pull: null, args: ["--title", "Add land", "--body-file", "/tmp/body.md", "--no-follow"] })
created.context.gh = ((original) => (command) => {
  if (command[0] === "pr" && command[1] === "list" && created.log.some((line) => line.startsWith("gh pr create"))) {
    return ok(JSON.stringify([{ number: 394, baseRefName: "main", url: "u" }]))
  }
  return original(command)
})(created.context.gh)
same("a title and a body file open the pull request against main", await created.run(), 0)
same(
  "with --base main",
  created.log.some((line) => line.startsWith("gh pr create --base main")),
  true,
)

const longTitle = `Add pnpm land, which checks, pushes, queues and follows a pull request to merged`
const refusedTitle = harness({ pull: null, args: ["--title", longTitle, "--body-file", "/tmp/body.md"] })
same("a --title over the limit stops", await refusedTitle.run(), 1)
same("before the check", refusedTitle.log.includes("check"), false)
same(
  "and before the push",
  refusedTitle.log.some((line) => line.startsWith("git push")),
  false,
)
same(
  "it prints the length and the limit",
  refusedTitle.said
    .at(-1)
    .startsWith(`STOPPED at title: --title is ${[...longTitle].length} characters, limit 72: it is too long.`),
  true,
)

const oldTitle = harness({
  pull: { number: 412, baseRefName: "main", url: "u", title: "Add the chat list.", body: "" },
})
same("an open pull request whose title breaks the rule stops", await oldTitle.run(), 1)
same("before the check", oldTitle.log.includes("check"), false)
same(
  "it names the pull request and how to retitle it",
  oldTitle.said.at(-1).includes("the title of pull request 412 is 18 characters, limit 72: it ends with a full stop") &&
    oldTitle.said.at(-1).includes("gh pr edit 412 --title"),
  true,
)
same("an open pull request's title wins over --title", await harness({ args: ["--title", longTitle] }).run(), 0)

const proofless = harness({
  pull: null,
  bodyText: "## What changes\n\nA.\n",
  args: ["--title", "Add land", "--body-file", "/tmp/body.md", "--check"],
})
same("a body with no Proof heading only warns", await proofless.run(), 0)
same(
  "and says so in one line",
  proofless.said.filter((line) => line.startsWith("body       warning: the body has no ## Proof heading")).length,
  1,
)
same(
  "a body with a Proof heading says nothing",
  clean.said.some((line) => line.startsWith("body")),
  false,
)
const prProofless = harness({
  pull: { number: 412, baseRefName: "main", url: "u", title: "Add land", body: "A." },
  args: ["--check"],
})
await prProofless.run()
same(
  "an open pull request's body is read too",
  prProofless.said.some((line) => line.includes("no ## Proof heading")),
  true,
)
same(
  "and the body file is not",
  prProofless.log.some((line) => line.startsWith("read ")),
  false,
)
const unread = harness({ pull: null, bodyText: null, args: ["--title", "Add land", "--body-file", "/tmp/none.md"] })
same("a body file that cannot be read stops", await unread.run(), 1)
same("before the check", unread.log.includes("check"), false)

const watch = harness({ args: ["--watch"], reads: [pullAnswer({ merged: true })] })
same("--watch only follows", await watch.run(), 0)
same("and checks nothing", watch.log.includes("check"), false)

const status = harness({ args: ["--status"], reads: [pullAnswer({ armed: true })] })
same("--status changes nothing and exits 0", await status.run(), 0)
same(
  "it pushes, merges and checks nothing",
  status.log.some((line) => /^git push|^gh pr merge|^check/.test(line)),
  false,
)
same(
  "it says where the pull request stands",
  status.said.some((line) => line.includes("auto-merge is armed")),
  true,
)

const ranNothing = (run) => run.log.length === 0

for (const flag of ["--help", "-h"]) {
  const help = harness({ args: [flag] })
  same(`${flag} exits 0`, await help.run(), 0)
  same(`${flag} touches neither git nor gh`, ranNothing(help), true)
  same(
    `${flag} prints the usage`,
    help.said.some((line) => line.startsWith("usage: pnpm land")),
    true,
  )
}

const typo = harness({ args: ["--tittle", "Add land"] })
same("a flag the script does not know exits 1", await typo.run(), 1)
same("and starts no land", ranNothing(typo), true)
same(
  "and names the flag and the usage",
  typo.said.some((line) => line.includes("--tittle")) && typo.said.some((line) => line.startsWith("usage: pnpm land")),
  true,
)

const stray = harness({ args: ["help"] })
same("a stray word exits 1", await stray.run(), 1)
same("and starts no land", ranNothing(stray), true)

const knownFlags = harness({
  args: ["--pr", "394", "--title", "Add land", "--body-file", "/tmp/body.md", "--no-follow", "--check"],
})
same("every flag the script knows is accepted", knownFlags.context.args.unknown, [])

const early = harness({
  pull: null,
  args: ["--title", "Add land", "--body-file", "/tmp/body.md", "--no-follow"],
  reads: [pullAnswer({ contexts: [] }), pullAnswer({ contexts: [] }), pullAnswer({ armed: true })],
})
early.context.gh = ((original) => (command) => {
  if (command[0] === "pr" && command[1] === "list" && early.log.some((line) => line.startsWith("gh pr create"))) {
    return ok(JSON.stringify([{ number: 394, baseRefName: "main", url: "u" }]))
  }
  return original(command)
})(early.context.gh)
early.context.read = ((original) => () => {
  early.log.push("read")
  return original()
})(early.context.read)
same("a push whose ci has not started waits, then arms", await early.run(), 0)
const mergeAt = early.log.findIndex((line) => line.startsWith("gh pr merge"))
same(
  "and merges only after a check is on the head",
  early.log.slice(0, mergeAt).filter((line) => line === "read").length,
  3,
)
same(
  "and says it waits",
  early.said.some((line) => line.startsWith("queue") && line.includes("waiting")),
  true,
)

const silent = harness({ reads: [pullAnswer({ contexts: [] })] })
same("a head that never gets a check stops the queue step", await silent.run(), 1)
same(
  "and merges nothing",
  silent.log.some((line) => line.startsWith("gh pr merge")),
  false,
)

const removedStatus = harness({
  args: ["--status"],
  reads: [
    pullAnswer({
      timeline: [
        { __typename: "PullRequestCommit" },
        { __typename: "RemovedFromMergeQueueEvent", reason: "invalid_merge_commit", createdAt: "2026-11-13T01:40:40Z" },
      ],
    }),
  ],
})
same("--status exits 0 for a removed head", await removedStatus.run(), 0)
same(
  "--status says why the queue removed it",
  removedStatus.said.some((line) => line.includes("the merge queue removed this head: invalid_merge_commit")),
  true,
)
