import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { behindMain, conflictsWithMain, dirtyFiles, runner } from "./land-git.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}\n${JSON.stringify(actual)}\n${JSON.stringify(expected)}`)
  }
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "land-git-"))
process.on("exit", () => fs.rmSync(folder, { recursive: true, force: true }))
const identity = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "-c", "commit.gpgsign=false"]
const raw = (cwd, ...args) =>
  execFileSync("git", [...identity, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const write = (cwd, name, text) => fs.writeFileSync(path.join(cwd, name), text)

const remote = path.join(folder, "remote.git")
const work = path.join(folder, "work")
raw(folder, "init", "-q", "--bare", "-b", "main", remote)
raw(folder, "clone", "-q", remote, work)
raw(work, "checkout", "-q", "-b", "main")
write(work, "title.txt", "one\ntwo\nthree\n")
write(work, "other.txt", "other\n")
raw(work, "add", "-A")
raw(work, "commit", "-q", "-m", "start")
raw(work, "push", "-q", "-u", "origin", "main")
raw(work, "switch", "-q", "-c", "mine")
write(work, "title.txt", "one\nmine\nthree\n")
raw(work, "commit", "-q", "-am", "mine")

const git = runner("git", work)
same("a clean branch is not dirty", dirtyFiles(git), [])
write(work, "scratch.txt", "x\n")
same("an untracked file is dirty", dirtyFiles(git), ["scratch.txt"])
fs.rmSync(path.join(work, "scratch.txt"))

same("a branch main did not touch has no conflict", conflictsWithMain(git), [])
same("and is not behind", behindMain(git), 0)

const other = path.join(folder, "other")
raw(folder, "clone", "-q", remote, other)
write(other, "title.txt", "one\ntheirs\nthree\n")
raw(other, "commit", "-q", "-am", "theirs")
raw(other, "push", "-q", "origin", "main")
raw(work, "fetch", "-q", "origin", "main")

same("a branch that changed the same line main changed conflicts in that file", conflictsWithMain(git), ["title.txt"])
same("and is one commit behind", behindMain(git), 1)
