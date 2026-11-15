import assert from "node:assert/strict"
import { sourceFindings, tsconfigFindings } from "./boundaries.mjs"

const flagged = (source, filename = "core.ts") => sourceFindings(filename, source).length

for (const specifier of [
  "cloudflare:workers",
  "@cloudflare/workers-types",
  "wrangler",
  "node:fs",
  "fs",
  "path/posix",
]) {
  assert.equal(flagged(`import { x } from "${specifier}"`), 1, `${specifier} is refused`)
}
assert.equal(flagged(`const fs = await import("node:fs")`), 1, "a dynamic import is refused")
assert.equal(flagged(`export * from "node:fs"`), 1, "a re-export is refused")
assert.equal(flagged(`import { Hono } from "hono"\nimport { x } from "./wire.js"`), 0, "portable imports pass")

assert.equal(flagged("const now = Date.now()"), 1, "reading the clock directly is refused")
assert.equal(flagged("const id = crypto.randomUUID()"), 1, "minting an id directly is refused")
assert.equal(flagged('const at = new Date("2026-01-01")'), 0, "parsing a date passes")
assert.equal(flagged("const now = new Date()", "usage.test.ts"), 0, "a test may read the clock")

assert.equal(tsconfigFindings("t", { compilerOptions: { lib: ["es2023", "webworker"], types: [] } }).length, 0)
assert.equal(tsconfigFindings("t", { compilerOptions: { lib: ["es2023", "DOM"], types: [] } }).length, 1, "DOM lib")
assert.equal(tsconfigFindings("t", { compilerOptions: { lib: ["es2023"], types: ["node"] } }).length, 1, "node types")
assert.equal(tsconfigFindings("t", { compilerOptions: { lib: ["es2023"] } }).length, 1, "default types")
