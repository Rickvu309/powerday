import assert from "node:assert/strict"
import { stripComments } from "./strip-comments.mjs"

const source = [
  "// Note: a whole-line comment",
  "const a = 1 // a trailing comment",
  "/**",
  " * A block over lines.",
  " */",
  "export const b = () => (",
  "  <div>",
  "    {/* a JSX comment */}",
  '    <span title="// not a comment">{a}</span>',
  "  </div>",
  ")",
  "try {",
  "  run()",
  "} catch {",
  "  /* ignore */",
  "}",
  "",
].join("\n")

const expected = [
  "const a = 1",
  "export const b = () => (",
  "  <div>",
  '    <span title="// not a comment">{a}</span>',
  "  </div>",
  ")",
  "try {",
  "  run()",
  "} catch {",
  "}",
  "",
].join("\n")

assert.equal(stripComments("example.tsx", source), expected, "strips line, trailing, block and JSX comments, and keeps block braces")
assert.equal(stripComments("clean.ts", "export const c = 1\n"), "export const c = 1\n", "leaves code without comments alone")
