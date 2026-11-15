import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { astroProjects, tscProjects } from "./typecheck.mjs"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-typecheck-"))
try {
  for (const project of ["apps/site", "apps/plain", "apps/chat", "packages/docs", "packages/core"])
    fs.mkdirSync(path.join(root, project), { recursive: true })
  for (const file of ["apps/site/astro.config.mjs", "apps/site/tsconfig.json", "packages/docs/astro.config.mjs"])
    fs.writeFileSync(path.join(root, file), "")
  for (const file of ["apps/chat/tsconfig.json", "packages/core/tsconfig.json"])
    fs.writeFileSync(path.join(root, file), "")
  const astro = astroProjects(root)
  if (JSON.stringify(astro) !== JSON.stringify(["apps/site", "packages/docs"])) {
    throw new Error(`typecheck finds every Astro project under apps and packages, and only those\n${astro}`)
  }
  const tsc = tscProjects(root)
  if (JSON.stringify(tsc) !== JSON.stringify(["apps/chat", "packages/core"])) {
    throw new Error(
      `typecheck builds every other project with a tsconfig.json, and leaves Astro to astro check\n${tsc}`,
    )
  }
  const scoped = [...astroProjects(root, ["apps/chat"]), ...tscProjects(root, ["apps/chat"])]
  if (JSON.stringify(scoped) !== JSON.stringify(["apps/chat"])) {
    throw new Error(`a scoped typecheck checks only the projects in scope\n${scoped}`)
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
