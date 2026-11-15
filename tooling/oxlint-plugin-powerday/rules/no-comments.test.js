import { expectAccepts, expectRejects, lintSource } from "../harness.js"

const rule = { "powerday/no-comments": "error" }
const comment = "Remove this comment."
const suppression =
  "Remove this suppression. eslint-disable and oxlint-disable are comments, and comments are not allowed."
const expectErrorMessage = "Remove @ts-expect-error. It is allowed only in a *.proof.ts file."

expectRejects(
  "no-comments rejects a line comment",
  "mistake.ts",
  "export const saved = 1 // landed twice\n",
  rule,
  comment,
)

expectRejects(
  "no-comments rejects a block comment",
  "block.ts",
  "export const saved = 1 /* landed twice */\n",
  rule,
  comment,
)

expectRejects(
  "no-comments rejects eslint-disable-next-line",
  "eslint.ts",
  "export const saved = 1 // eslint-disable-next-line powerday/no-comments\n",
  rule,
  suppression,
)

expectRejects(
  "no-comments rejects oxlint-disable-next-line",
  "oxlint-line.ts",
  "// oxlint-disable-next-line powerday/no-comments\nexport const saved = 1\n",
  rule,
  suppression,
)

expectAccepts("no-comments accepts the uncommented fix", "fix.ts", "export const saved = 1\n", rule)

expectRejects(
  "no-comments rejects @ts-expect-error outside the allow list",
  "ordinary.ts",
  "// @ts-expect-error\nexport const saved = 1\n",
  rule,
  expectErrorMessage,
)

expectAccepts(
  "no-comments allows @ts-expect-error in a proof file",
  "pair.proof.ts",
  "// @ts-expect-error: the pair is the fixture\nexport const saved = 1\n",
  rule,
)

expectRejects(
  "no-comments still rejects an ordinary comment in a proof file",
  "pair.proof.ts",
  "// the pair is documented here\nexport const saved = 1\n",
  rule,
  comment,
)

expectAccepts(
  "no-comments ignores comment text inside a string",
  "string.ts",
  'export const saved = "// not a comment"\n',
  rule,
)

const astro = lintSource("page.astro", "---\n// hidden\nconst saved = 1\n---\n<!-- hidden -->\n<p>{saved}</p>\n", rule)
const astroReports = astro.output.split(comment).length - 1
if (astro.status === 0 || astroReports !== 1) {
  throw new Error(`astro frontmatter comment was not the only report\n${astro.output}`)
}

const css = lintSource("note.css", "body { color: black /* hidden */ }\n", rule)
if (css.output.includes(comment) || css.output.includes(suppression)) {
  throw new Error(`css comment was reported by the plugin\n${css.output}`)
}

const yaml = lintSource("note.yaml", "name: deck # hidden\n", rule)
if (yaml.output.includes(comment) || yaml.output.includes(suppression)) {
  throw new Error(`yaml comment was reported by the plugin\n${yaml.output}`)
}

console.log("no-comments tests passed")
