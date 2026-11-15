import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const astroProjects = (root) =>
  ["apps", "packages"]
    .flatMap((folder) => {
      const parent = path.join(root, folder)
      if (!existsSync(parent)) return []
      return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${folder}/${entry.name}`)
    })
    .filter((project) => existsSync(path.join(root, project, "astro.config.mjs")))
    .sort()

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const failed = astroProjects(root).filter(
    (project) =>
      spawnSync("pnpm", ["exec", "astro", "check"], { cwd: path.join(root, project), stdio: "inherit" }).status !== 0,
  )
  if (failed.length > 0) {
    console.error(`typecheck failed in ${failed.join(", ")}`)
    process.exit(1)
  }
}
