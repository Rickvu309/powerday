import { spawnSync } from "node:child_process"

export const runner = (command, cwd) => (args, input) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, input })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? String(result.error ?? ""),
  }
}

export const succeeds = (result, what) => {
  if (result.status !== 0) throw new Error(`${what}: ${(result.stderr || result.stdout).trim()}`)
  return result.stdout
}

export const currentBranch = (git) =>
  succeeds(git(["rev-parse", "--abbrev-ref", "HEAD"]), "could not read the branch").trim()

export const dirtyFiles = (git) =>
  succeeds(git(["status", "--porcelain", "--untracked-files=all"]), "could not read the working tree")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(3))

export const conflictsWithMain = (git, ref = "HEAD") => {
  const merged = git(["merge-tree", "--write-tree", "--name-only", "origin/main", ref])
  if (merged.status === 0) return []
  if (merged.status !== 1) throw new Error(`could not try the merge with origin/main: ${merged.stderr.trim()}`)
  const [, ...rest] = merged.stdout.split("\n")
  return rest.slice(0, rest.indexOf("")).filter((name) => name !== "")
}

export const behindMain = (git, ref = "HEAD") =>
  Number(succeeds(git(["rev-list", "--count", `${ref}..origin/main`]), "could not count the commits main gained"))
