import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { uncheckedPushes } from "./checked.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const unchecked = uncheckedPushes(root, fs.readFileSync(0, "utf8"))
if (unchecked.length > 0) {
  for (const { ref, commit } of unchecked) {
    console.error(`push refused: no passing pnpm check ran on ${ref} at ${commit.slice(0, 8)}.`)
  }
  console.error("Run pnpm check with exactly what you commit, then push again.")
  process.exit(1)
}
