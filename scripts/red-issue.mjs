import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const issueAction = ({ result, open }) => {
  if (result === "success") return open ? "close" : "none"
  if (result !== "failure") return "none"
  return open ? "comment" : "open"
}

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [label, title, result, line] = process.argv.slice(2)
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim()
  const open = gh([
    "issue",
    "list",
    "--label",
    label,
    "--state",
    "open",
    "--json",
    "number",
    "--jq",
    ".[0].number // empty",
  ])
  const action = issueAction({ result, open: open !== "" })
  if (action === "close") gh(["issue", "close", open, "--comment", line])
  if (action === "comment") gh(["issue", "comment", open, "--body", line])
  if (action === "open") {
    gh(["label", "create", label, "--description", title, "--color", "B60205", "--force"])
    gh(["issue", "create", "--title", title, "--label", label, "--body", line])
  }
  console.log(`${label}: ${action}`)
}
