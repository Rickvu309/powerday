import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isChecked, stampChecked, uncheckedPushes, workingTree } from "./checked.mjs"
import { installHooks } from "./install-hooks.mjs"

const same = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}\n${JSON.stringify(actual)}\n${JSON.stringify(expected)}`)
  }
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "checked-"))
process.on("exit", () => fs.rmSync(folder, { recursive: true, force: true }))
const configured = (key) => {
  try {
    return execFileSync("git", ["config", key], { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}
const identity =
  configured("user.email") === "" ? ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com"] : []
const git = (cwd, ...args) =>
  execFileSync("git", [...identity, "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
const root = path.join(folder, "repo")
const remote = path.join(folder, "remote.git")
fs.mkdirSync(path.join(root, "scripts"), { recursive: true })
git(folder, "init", "-q", "--bare", remote)
git(root, "init", "-q", "-b", "main")
const here = path.dirname(fileURLToPath(import.meta.url))
for (const name of ["checked.mjs", "pre-push.mjs"])
  fs.copyFileSync(path.join(here, name), path.join(root, "scripts", name))
fs.writeFileSync(path.join(root, ".gitignore"), "ignored.txt\n")
fs.writeFileSync(path.join(root, "a.txt"), "one")
git(root, "add", "-A")
git(root, "commit", "-q", "-m", "one")
git(root, "remote", "add", "origin", remote)

const zero = "0".repeat(40)
const head = () => git(root, "rev-parse", "HEAD")
same(
  "an unchecked commit is refused",
  uncheckedPushes(root, `refs/heads/main ${head()} refs/heads/main ${zero}\n`).length,
  1,
)
same("a deleted branch is not checked", uncheckedPushes(root, `(delete) ${zero} refs/heads/old ${head()}\n`), [])

fs.writeFileSync(path.join(root, "a.txt"), "two")
fs.writeFileSync(path.join(root, "new.txt"), "new")
fs.writeFileSync(path.join(root, "ignored.txt"), "ignored")
const checked = stampChecked(root, workingTree(root))
git(root, "add", "-A")
git(root, "commit", "-q", "-m", "two")
same("the commit of exactly the checked files counts as checked", isChecked(root, "HEAD"), true)
same("the checked tree is the committed tree", checked, git(root, "rev-parse", "HEAD^{tree}"))

fs.writeFileSync(path.join(root, "a.txt"), "three")
git(root, "commit", "-q", "-am", "three")
same("an edit after the check is not checked", isChecked(root, "HEAD"), false)

installHooks(root)
const hooksPath = configured("core.hooksPath")
const push = () => spawnSync("git", ["push", "-q", "origin", "HEAD:refs/heads/main"], { cwd: root, encoding: "utf8" })
const refused = push()
same("git push refuses the unchecked commit", refused.status === 0, false)
same(
  "the refusal says what to run",
  refused.stderr.includes("Run pnpm check with exactly what you commit, then push again."),
  true,
)
stampChecked(root, workingTree(root))
const allowed = push()
same(
  `git push takes the checked commit${hooksPath ? ` (through ${hooksPath})` : ""}`,
  [allowed.status, allowed.stderr.trim()],
  [0, ""],
)

console.log("checked tests passed")
