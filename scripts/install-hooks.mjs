import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const prePushHook = [
  "#!/bin/sh",
  'script="$(git rev-parse --show-toplevel)/scripts/pre-push.mjs"',
  '[ -f "$script" ] || exit 0',
  'exec node "$script" "$@"',
  "",
].join("\n")

export const installHooks = (root) => {
  const common = path.resolve(
    root,
    execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim(),
  )
  const hook = path.join(common, "hooks", "pre-push")
  fs.mkdirSync(path.dirname(hook), { recursive: true })
  fs.writeFileSync(hook, prePushHook, { mode: 0o755 })
  fs.chmodSync(hook, 0o755)
  return hook
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const onCi = process.env.CI === "true" || process.env.CI === "1"
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  if (!onCi && fs.existsSync(path.join(root, ".git"))) installHooks(root)
}
