import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inScope, scopeFrom } from "./affected.mjs"

const workspaces = (root, scope) =>
  ["apps", "packages"]
    .flatMap((folder) => {
      const parent = path.join(root, folder)
      if (!existsSync(parent)) return []
      return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${folder}/${entry.name}`)
    })
    .filter((project) => inScope(scope, project))
    .sort()

const astro = (root, project) => existsSync(path.join(root, project, "astro.config.mjs"))

export const astroProjects = (root, scope = "all") => workspaces(root, scope).filter((project) => astro(root, project))

export const tscProjects = (root, scope = "all") =>
  workspaces(root, scope).filter(
    (project) => !astro(root, project) && existsSync(path.join(root, project, "tsconfig.json")),
  )

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const scope = scopeFrom(process.env)
  const failed = astroProjects(root, scope).filter(
    (project) =>
      spawnSync("pnpm", ["exec", "astro", "check"], { cwd: path.join(root, project), stdio: "inherit" }).status !== 0,
  )
  const projects = tscProjects(root, scope)
  if (projects.length > 0) {
    const tsc = path.join(root, "node_modules", ".bin", "tsc")
    if (spawnSync(tsc, ["-b", ...projects], { cwd: root, stdio: "inherit" }).status !== 0) failed.push(...projects)
  }
  if (failed.length > 0) {
    console.error(`typecheck failed in ${failed.join(", ")}`)
    process.exit(1)
  }
}
