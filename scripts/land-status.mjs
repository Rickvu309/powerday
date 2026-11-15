import { behindMain, conflictsWithMain } from "./land-git.mjs"
import { failedRunFor } from "./land-follow.mjs"
import { ciFailureLines } from "./land-report.mjs"
import { baseFault, queueLine, removalLine } from "./merge-queue.mjs"

const checksLine = ({ passed, running, failed }) =>
  `${passed.length} passed, ${running.length} running, ${failed.length} failed${failed.length > 0 ? ` (${failed.join(", ")})` : ""}`

export const statusLines = ({ number, branch, repository, pull, git, gh, ref = "HEAD" }) => {
  const lines = [
    `pull request ${number} targets ${pull.base}${baseFault(number, pull.base) === undefined ? "" : ". Wrong base. Fix: gh pr edit " + number + " --base main"}`,
  ]
  if (pull.merged) lines.push("state       merged")
  lines.push(`mergeable   ${pull.mergeable} (merge state ${pull.mergeState})`)
  const conflicts = conflictsWithMain(git, ref)
  lines.push(
    conflicts.length === 0
      ? "conflicts   none with origin/main"
      : `conflicts   with origin/main in ${conflicts.join(", ")}. Rebase: git fetch origin main && git rebase origin/main`,
  )
  lines.push(`behind      ${behindMain(git, ref)} commits behind origin/main`)
  lines.push(`checks      ${checksLine(pull.checks)}`)
  lines.push(`queue       ${queueLine(pull)}`)
  if (removalLine(pull) !== undefined) lines.push(`removed     ${removalLine(pull)}`)
  const failed = failedRunFor({ gh, repository, branch, head: pull.head, number, event: "pull_request" })
  lines.push(
    failed === undefined
      ? "last failure none on this head"
      : `last failure ${ciFailureLines({ repository, run: failed, gh, git }).join("\n              ")}`,
  )
  return lines
}
