import { lintSource } from "./harness.js"
import { scanSource } from "./scan-comments.js"

const rule = { "powerday/no-comments": "error" }
const suppression =
  "Remove this suppression. eslint-disable and oxlint-disable are comments, and comments are not allowed."
const comment = "Remove this comment."

const assertHit = (name, hits, line, message) => {
  const match = hits.find((hit) => hit.includes(`:${line}: `) && hit.endsWith(message))
  if (!match) throw new Error(`${name}\n${hits.join("\n")}`)
}

const assertClean = (name, hits) => {
  if (hits.length !== 0) throw new Error(`${name}\n${hits.join("\n")}`)
}

const fileDisable = "/* oxlint-disable powerday/no-comments */\nexport const saved = 1\n"
const fileHits = await scanSource("oxlint-file.ts", fileDisable)
assertHit("file-level oxlint-disable", fileHits, 1, suppression)
const linted = lintSource("oxlint-file.ts", fileDisable, rule)
if (linted.status !== 0) {
  throw new Error(`file-level oxlint-disable should pass oxlint and still fail the scanner\n${linted.output}`)
}

assertClean("directive inside a string", await scanSource("quoted.ts", 'export const saved = "/* oxlint-disable */"\n'))
assertClean(
  "directive inside a template",
  await scanSource("templated.ts", "export const saved = `/* oxlint-disable */`\n"),
)
assertHit("css block comment", await scanSource("note.css", "body { color: black /* hidden */ }\n"), 1, comment)
assertClean("css string", await scanSource("quoted.css", 'body { content: "/* hidden */" }\n'))
assertClean("css double slash", await scanSource("slash.css", "body { color: black } // not a comment\n"))
assertHit("yaml hash comment", await scanSource("note.yaml", "name: deck # hidden\n"), 1, comment)
assertClean("yaml quoted hash", await scanSource("color.yaml", 'color: "' + "#" + "222222" + '"\n'))
assertHit(
  "astro html comment",
  await scanSource("page.astro", "---\nconst saved = 1\n---\n<!-- hidden -->\n<p>{saved}</p>\n"),
  4,
  comment,
)
assertHit(
  "astro style comment",
  await scanSource("styled.astro", "<style>\n.a { color: black /* hidden */ }\n</style>\n"),
  2,
  comment,
)
assertClean(
  "astro style string",
  await scanSource("styled.astro", '<style>\n.a { content: "/* hidden */" }\n</style>\n'),
)
assertHit("astro expression comment", await scanSource("expr.astro", "{/* hidden */}\n"), 1, comment)
assertClean("astro template is not a comment", await scanSource("expr.astro", "{`<!-- hidden -->`}\n"))
assertClean(
  "astro frontmatter comment belongs to the rule",
  await scanSource("page.astro", "---\n// hidden\nconst saved = 1\n---\n<p>ok</p>\n"),
)
assertHit(
  "astro frontmatter suppression",
  await scanSource("page.astro", "---\n/* oxlint-disable powerday/no-comments */\nconst saved = 1\n---\n<p>ok</p>\n"),
  2,
  suppression,
)

console.log("scan-comments tests passed")
