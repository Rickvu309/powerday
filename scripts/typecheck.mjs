import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const workspaces = (root) =>
  ["apps", "packages"]
    .flatMap((folder) => {
      const parent = path.join(root, folder)
      if (!existsSync(parent)) return []
      return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${folder}/${entry.name}`)
    })
    .sort()

const astro = (root, project) => existsSync(path.join(root, project, "astro.config.mjs"))

export const astroProjects = (root) => workspaces(root).filter((project) => astro(root, project))

export const tscProjects = (root) =>
  workspaces(root).filter((project) => !astro(root, project) && existsSync(path.join(root, project, "tsconfig.json")))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const failed = astroProjects(root).filter(
    (project) =>
      spawnSync("pnpm", ["exec", "astro", "check"], { cwd: path.join(root, project), stdio: "inherit" }).status !== 0,
  )
  const projects = tscProjects(root)
  if (projects.length > 0) {
    const tsc = path.join(root, "node_modules", ".bin", "tsc")
    if (spawnSync(tsc, ["-b", ...projects], { cwd: root, stdio: "inherit" }).status !== 0) failed.push(...projects)
  }
  if (failed.length > 0) {
    console.error(`typecheck failed in ${failed.join(", ")}`)
    process.exit(1)
  }
}
