import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const git = (root, args, env = process.env) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"] }).trim()

const stampFolder = (root) =>
  path.join(path.resolve(root, git(root, ["rev-parse", "--git-common-dir"])), "powerday-checked")

export const workingTree = (root) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "checked-index-"))
  try {
    const index = path.join(folder, "index")
    const env = { ...process.env, GIT_INDEX_FILE: index }
    git(root, ["read-tree", "HEAD"], env)
    git(root, ["add", "-A"], env)
    return git(root, ["write-tree"], env)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

export const stampChecked = (root, tree = workingTree(root)) => {
  const folder = stampFolder(root)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, tree), "")
  return tree
}

const treeOf = (root, commit) => git(root, ["rev-parse", `${commit}^{tree}`])

export const isChecked = (root, commit) => fs.existsSync(path.join(stampFolder(root), treeOf(root, commit)))

export const uncheckedPushes = (root, pushed) =>
  pushed
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((words) => words.length >= 2 && /^[0-9a-f]{40}$/.test(words[1]) && !/^0+$/.test(words[1]))
    .map(([ref, commit]) => ({ ref, commit }))
    .filter(({ commit }) => !isChecked(root, commit))
