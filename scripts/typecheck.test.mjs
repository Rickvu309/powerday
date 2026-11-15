import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { astroProjects } from "./typecheck.mjs"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerday-typecheck-"))
try {
  for (const project of ["apps/site", "apps/plain", "packages/docs"])
    fs.mkdirSync(path.join(root, project), { recursive: true })
  fs.writeFileSync(path.join(root, "apps/site/astro.config.mjs"), "")
  fs.writeFileSync(path.join(root, "packages/docs/astro.config.mjs"), "")
  const found = astroProjects(root)
  if (JSON.stringify(found) !== JSON.stringify(["apps/site", "packages/docs"])) {
    throw new Error(`typecheck finds every Astro project under apps and packages, and only those\n${found}`)
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
