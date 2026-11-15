const pullQuery = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state merged baseRefName headRefOid mergeable mergeStateStatus isInMergeQueue mergeQueueEntry{position state} timelineItems(last:30,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT,HEAD_REF_FORCE_PUSHED_EVENT,PULL_REQUEST_COMMIT]){nodes{__typename ... on RemovedFromMergeQueueEvent{createdAt reason}}} autoMergeRequest{enabledAt mergeMethod} commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{name conclusion status} ... on StatusContext{context state}}}}}}}} mergeQueue(branch:"main"){entries(first:50){nodes{position pullRequest{number}}}}}}`

export const pullArgs = (repository, number) => {
  const [owner, name] = repository.split("/")
  return [
    "api",
    "graphql",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${number}`,
    "-f",
    `query=${pullQuery}`,
  ]
}

const passedConclusions = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"])

const sortChecks = (contexts) => {
  const checks = { passed: [], failed: [], running: [] }
  for (const context of contexts) {
    const run = context.__typename === "CheckRun"
    const name = run ? context.name : context.context
    if (run ? context.status !== "COMPLETED" : ["PENDING", "EXPECTED"].includes(context.state))
      checks.running.push(name)
    else if (run ? passedConclusions.has(context.conclusion) : context.state === "SUCCESS") checks.passed.push(name)
    else checks.failed.push(name)
  }
  return checks
}

const latestRemoval = (items) => {
  const lastPush = items.findLastIndex((item) => item.__typename !== "RemovedFromMergeQueueEvent")
  const lastRemoval = items.findLastIndex((item) => item.__typename === "RemovedFromMergeQueueEvent")
  return lastRemoval > lastPush && items[lastRemoval].reason !== "merged"
    ? { reason: items[lastRemoval].reason, at: items[lastRemoval].createdAt }
    : undefined
}

export const parsePull = (text) => {
  const { pullRequest, mergeQueue } = JSON.parse(text).data.repository
  const rollup = pullRequest.commits.nodes[0]?.commit.statusCheckRollup
  return {
    state: pullRequest.state,
    merged: pullRequest.merged,
    base: pullRequest.baseRefName,
    head: pullRequest.headRefOid,
    mergeable: pullRequest.mergeable,
    mergeState: pullRequest.mergeStateStatus,
    queued: pullRequest.mergeQueueEntry !== null,
    position: pullRequest.mergeQueueEntry?.position,
    armed: pullRequest.autoMergeRequest !== null,
    checks: sortChecks(rollup?.contexts.nodes ?? []),
    removal: latestRemoval(pullRequest.timelineItems.nodes),
    queue: (mergeQueue?.entries.nodes ?? []).map((entry) => entry.pullRequest.number),
  }
}

export const queueLine = (pull) => {
  if (pull.queued) return `in the merge queue at position ${pull.position}`
  if (pull.armed) return "auto-merge is armed, and the queue takes it when checks pass"
  return "not in the merge queue and auto-merge is not armed"
}

export const removalLine = (pull) =>
  pull.removal === undefined
    ? undefined
    : `the merge queue removed this head: ${pull.removal.reason} (${pull.removal.at})`

export const readPull = ({ read, repository, number }) => parsePull(read(pullArgs(repository, number)))

const checkCount = ({ checks }) => checks.passed.length + checks.running.length + checks.failed.length

export const awaitChecks = async ({
  read,
  repository,
  number,
  sleep,
  now,
  say,
  intervalMs = 10000,
  limitMs = 180000,
}) => {
  const started = now()
  for (;;) {
    const state = readPull({ read, repository, number })
    if (state.merged || state.queued || state.armed || checkCount(state) > 0) return { ok: true, state }
    if (now() - started >= limitMs) {
      return {
        ok: false,
        state,
        message: `no check has started on the head of pull request ${number} after ${Math.round(limitMs / 1000)} seconds. Queueing now would enter the merge queue with no check run. Look at: gh pr checks ${number}, then run pnpm land --watch`,
      }
    }
    say("waiting for ci to start on the head, so auto-merge is armed and not the queue entered directly")
    await sleep(intervalMs)
  }
}

const strategies = [["--auto", "--squash"], ["--auto"]]

export const enqueue = ({ merge, read, repository, number }) => {
  const said = []
  for (const strategy of strategies) {
    const args = ["pr", "merge", String(number), ...strategy]
    const result = merge(args)
    said.push(
      `gh ${args.join(" ")} said: ${`${result.stdout}${result.stderr}`.trim() || `nothing (exit ${result.status})`}`,
    )
    const state = readPull({ read, repository, number })
    if (state.queued || state.armed) return { ok: true, state, said }
    if (state.merged) return { ok: true, state, said }
  }
  const state = readPull({ read, repository, number })
  return {
    ok: false,
    state,
    said,
    message: `pull request ${number} is not queued and auto-merge is not armed, whatever gh printed. ${said.join(" ")}`,
  }
}

export const baseFault = (number, base) =>
  base === "main"
    ? undefined
    : `pull request ${number} targets ${base}, and every pull request targets main. A branch of another pull request has no merge queue, so a merge there lands with no ci. Fix: gh pr edit ${number} --base main, and wait for the other pull request to merge before this one.`
