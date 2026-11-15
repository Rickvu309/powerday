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

assert.equal(
  stripComments("example.tsx", source),
  expected,
  "strips line, trailing, block and JSX comments, and keeps block braces",
)
assert.equal(
  stripComments("clean.ts", "export const c = 1\n"),
  "export const c = 1\n",
  "leaves code without comments alone",
)
assert.equal(
  stripComments("joined.ts", "export const kind = (value: unknown) => typeof/**/value\n"),
  "export const kind = (value: unknown) => typeof value\n",
  "keeps the space a comment stood for between two words",
)
assert.equal(
  stripComments("twice.tsx", "export const d = () => <div>{/* one */ /* two */}<b /></div>\n"),
  "export const d = () => <div><b /></div>\n",
  "removes a JSX container holding two comments once",
)
assert.equal(
  stripComments("signs.ts", "let x = 1\nexport const y = x +/**/+x\n"),
  "let x = 1\nexport const y = x + +x\n",
  "keeps two plus signs from joining into an increment",
)
assert.equal(
  stripComments("asi.ts", "export function f() {\n  return/*\n comment */1\n}\n"),
  "export function f() {\n  return\n1\n}\n",
  "keeps the line break a comment held, so return still returns nothing",
)
