import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { followPull } from "./land-follow.mjs"
import { behindMain, conflictsWithMain, currentBranch, dirtyFiles, runner, succeeds } from "./land-git.mjs"
import { statusLines } from "./land-status.mjs"
import { awaitChecks, baseFault, enqueue, queueLine, readPull } from "./merge-queue.mjs"
import { hasProof, titleAdvice, titleLimit, titleVerdict } from "./title.mjs"

const valueFlags = ["--pr", "--title", "--body-file"]
const switchFlags = ["--status", "--watch", "--check", "--no-follow", "--help", "-h"]

export const usage = [
  "usage: pnpm land [--title <text> --body-file <path>] [--no-follow] [--check]",
  "       pnpm land --watch [--pr <number>]",
  "       pnpm land --status [--pr <number>]",
  "       pnpm land --help",
]

const unknownIn = (argv) => {
  const unknown = []
  for (let at = 0; at < argv.length; at += 1) {
    if (valueFlags.includes(argv[at])) at += 1
    else if (!switchFlags.includes(argv[at])) unknown.push(argv[at])
  }
  return unknown
}

const flagValue = (argv, name) => {
  const at = argv.indexOf(name)
  return at === -1 ? undefined : argv[at + 1]
}

export const parseArgs = (argv) => ({
  help: argv.includes("--help") || argv.includes("-h"),
  unknown: unknownIn(argv),
  status: argv.includes("--status"),
  watch: argv.includes("--watch"),
  checkOnly: argv.includes("--check"),
  follow: !argv.includes("--no-follow"),
  pr: flagValue(argv, "--pr") === undefined ? undefined : Number(flagValue(argv, "--pr")),
  title: flagValue(argv, "--title"),
  bodyFile: flagValue(argv, "--body-file"),
})

const findPull = ({ gh, branch, number }) => {
  const found =
    number === undefined
      ? gh([
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "open",
          "--json",
          "number,baseRefName,url,title,body",
          "--limit",
          "1",
        ])
      : gh(["pr", "view", String(number), "--json", "number,baseRefName,url"])
  const parsed = JSON.parse(succeeds(found, "could not read the pull request"))
  return number === undefined ? parsed[0] : parsed
}

class Stop extends Error {}

const readBody = (readText, file, stop) => {
  if (file === undefined) return undefined
  try {
    return readText(file)
  } catch (error) {
    return stop("body", `the body file ${file} cannot be read: ${error.message}`)
  }
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const land = async (ctx) => {
  const { args, git, gh, say, sleep = pause, now = () => Date.now() } = ctx
  const readText = ctx.readText ?? ((file) => fs.readFileSync(file, "utf8"))
  if (args.help) {
    for (const each of usage) say(each)
    return 0
  }
  if (args.unknown.length > 0) {
    say(`STOPPED: ${args.unknown.join(", ")} ${args.unknown.length === 1 ? "is" : "are"} not a flag of pnpm land.`)
    for (const each of usage) say(each)
    return 1
  }
  const line = (step, text) => say(`${step.padEnd(11)}${text}`)
  const stop = (step, why) => {
    throw new Stop(`STOPPED at ${step}: ${why}`)
  }
  const read = ctx.read ?? ((command) => succeeds(gh(command), `gh ${command[0]}`))
  const repository =
    ctx.repository ??
    succeeds(
      gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]),
      "could not name the repository",
    ).trim()
  const follow = (number, branch) =>
    followPull({
      number,
      branch,
      repository,
      read,
      gh,
      git,
      sleep,
      now,
      say,
      interval: ctx.interval,
      graceMs: ctx.graceMs,
      limitMs: ctx.limitMs,
    })
  try {
    const branch = args.pr === undefined || !(args.status || args.watch) ? currentBranch(git) : "(by number)"
    succeeds(git(["fetch", "origin", "main"]), "could not fetch origin/main")
    if (args.status || args.watch) {
      const pull = findPull({ gh, branch, number: args.pr })
      if (pull === undefined)
        stop("pull request", `${branch} has no open pull request. Push it and open one: gh pr create --base main`)
      const state = readPull({ read, repository, number: pull.number })
      if (args.status) {
        succeeds(
          git(["fetch", "origin", `pull/${pull.number}/head`]),
          `could not fetch the head of pull request ${pull.number}`,
        )
        const ref = "FETCH_HEAD"
        for (const each of statusLines({ number: pull.number, branch, repository, pull: state, git, gh, ref }))
          line("status", each)
        return 0
      }
      return await follow(pull.number, branch)
    }
    if (branch === "main" || branch === "HEAD")
      stop("branch", `you are on ${branch}. Land from the branch of your pull request.`)
    line("branch", `${branch}`)
    const dirty = dirtyFiles(git)
    if (dirty.length > 0)
      stop(
        "working tree",
        `${dirty.length} files are not committed (${dirty.slice(0, 5).join(", ")}). Commit them, so the check judges what you push.`,
      )
    git(["fetch", "origin", branch])
    let pull = findPull({ gh, branch })
    if (pull !== undefined) {
      const wrong = baseFault(pull.number, pull.baseRefName)
      if (wrong !== undefined) stop("base", wrong)
      line("base", `pull request ${pull.number} targets main`)
    } else line("base", "no pull request yet; it will open against main")
    const title = pull === undefined ? args.title : pull.title
    if (title !== undefined) {
      const fault = titleVerdict(title)
      const named = pull === undefined ? "--title" : `the title of pull request ${pull.number}`
      const retitle =
        pull === undefined ? "" : ` Retitle it: gh pr edit ${pull.number} --title "...", then run pnpm land again.`
      if (fault !== undefined) stop("title", `${named} is ${fault}. ${titleAdvice}${retitle}`)
      line("title", `${[...title].length} characters, within the limit of ${titleLimit}`)
    }
    const body = pull === undefined ? readBody(readText, args.bodyFile, stop) : pull.body
    if (body !== undefined && !hasProof(body))
      line("body", "warning: the body has no ## Proof heading. Say what you ran and what you saw, with counts.")
    const conflicts = conflictsWithMain(git)
    if (conflicts.length > 0) {
      stop(
        "conflicts",
        `this branch conflicts with origin/main in ${conflicts.join(", ")}. Rebase now, before the check: git rebase origin/main, resolve, then run pnpm land again.`,
      )
    }
    line("conflicts", `none; ${behindMain(git)} commits behind origin/main`)
    line("check", "running pnpm check")
    const checked = await ctx.check()
    if (checked.status !== 0)
      stop("check", "pnpm check failed. Fix what its output above names, commit, and run pnpm land again.")
    line("check", "the check passed and stamped this tree for the push guard")
    if (args.checkOnly) return 0
    const pushed = git(["push", "--force-with-lease", "--set-upstream", "origin", branch])
    if (pushed.status !== 0) stop("push", `git push refused: ${(pushed.stderr || pushed.stdout).trim()}`)
    line("push", `${branch} pushed with a lease`)
    if (pull === undefined) {
      if (args.title === undefined || args.bodyFile === undefined) {
        stop(
          "pull request",
          `${branch} has no pull request. Open it against main: gh pr create --base main --title "..." --body-file body.md, then run pnpm land --watch. Or run pnpm land again with --title and --body-file.`,
        )
      }
      succeeds(
        gh(["pr", "create", "--base", "main", "--head", branch, "--title", args.title, "--body-file", args.bodyFile]),
        "could not open the pull request",
      )
      pull = findPull({ gh, branch })
      if (pull === undefined) stop("pull request", "gh opened a pull request but could not read it back")
    }
    const wrong = baseFault(pull.number, pull.baseRefName)
    if (wrong !== undefined) stop("base", wrong)
    line("opened", `pull request ${pull.number}: ${pull.url}`)
    const ready = await awaitChecks({
      read,
      repository,
      number: pull.number,
      sleep,
      now,
      say: (text) => line("queue", text),
      intervalMs: ctx.checksIntervalMs,
      limitMs: ctx.checksLimitMs,
    })
    if (!ready.ok) stop("queue", ready.message)
    const queued = enqueue({ merge: gh, read, repository, number: pull.number })
    if (!queued.ok) stop("queue", queued.message)
    line("queue", queueLine(queued.state))
    return args.follow ? await follow(pull.number, branch) : 0
  } catch (error) {
    if (error instanceof Stop) {
      say(error.message)
      return 1
    }
    say(`STOPPED: ${error.message}`)
    return 1
  }
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const root = path.resolve(path.dirname(self), "..")
  const code = await land({
    args: parseArgs(process.argv.slice(2)),
    git: runner("git", root),
    gh: runner("gh", root),
    check: () =>
      new Promise((resolve) => {
        const child = spawn("pnpm", ["check"], { cwd: root, stdio: "inherit" })
        child.on("error", () => resolve({ status: 1 }))
        child.on("close", (status) => resolve({ status: status ?? 1 }))
      }),
    say: (text) => console.log(text),
  })
  process.exit(code)
}
