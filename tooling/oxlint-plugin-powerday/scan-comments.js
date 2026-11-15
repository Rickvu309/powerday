import path from "node:path"
import { parse as parseAstro } from "@astrojs/compiler"
import { parseSync } from "oxc-parser"
import postcss from "postcss"
import { LineCounter, Parser } from "yaml"

const suppressionMessage =
  "Remove this suppression. eslint-disable and oxlint-disable are comments, and comments are not allowed."
const commentMessage = "Remove this comment."
const suppression = /(?:eslint-disable|oxlint-disable)\b/u
const scripts = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"])
export const scannedExtensions = new Set([...scripts, ".css", ".yml", ".yaml", ".astro"])
const lineAt = (source, offset) => source.slice(0, offset).split("\n").length
const hit = (filename, line, message) => `${filename}:${line}: ${message}`

const codeHits = (filename, source, base, outer, suppressOnly) => {
  const parsed =
    outer === source && base === 0 ? parseSync(filename, source) : parseSync("slice.ts", source, { lang: "ts" })
  const hits = []
  for (const comment of parsed.comments) {
    const directive = suppression.test(comment.value)
    if (suppressOnly && !directive) continue
    hits.push(hit(filename, lineAt(outer, base + comment.start), directive ? suppressionMessage : commentMessage))
  }
  return hits
}

const cssHits = (filename, source, originLine) => {
  try {
    const hits = []
    postcss.parse(source).walkComments((comment) => {
      hits.push(hit(filename, originLine + comment.source.start.line - 1, commentMessage))
    })
    return hits
  } catch {
    return []
  }
}

const yamlHits = (filename, source) => {
  const lines = new LineCounter()
  const hits = []
  const walk = (token) => {
    if (token?.type === "comment") hits.push(hit(filename, lines.linePos(token.offset).line, commentMessage))
    if (token && typeof token === "object") for (const value of Object.values(token)) walk(value)
  }
  for (const token of new Parser(lines.addNewLine).parse(source)) walk(token)
  return hits
}

const astroHits = async (filename, source) => {
  const hits = []
  const visit = (node) => {
    if (node.type === "comment") hits.push(hit(filename, node.position.start.line, commentMessage))
    if (node.type === "frontmatter" && node.value) {
      const base = source.indexOf(node.value, node.position.start.offset)
      if (base >= 0) hits.push(...codeHits(filename, node.value, base, source, true))
    }
    const style = node.type === "element" && node.name === "style"
    const code = node.type === "expression" || (node.type === "element" && node.name === "script")
    for (const child of node.children ?? []) {
      if (child.type === "text" && child.value.length > 0 && style) {
        hits.push(...cssHits(filename, child.value, child.position.start.line))
      }
      if (child.type === "text" && child.value.length > 0 && code) {
        hits.push(...codeHits(filename, child.value, child.position.start.offset, source, node.type === "element"))
      }
      visit(child)
    }
  }
  visit((await parseAstro(source)).ast)
  return hits
}

export const scanSource = async (filename, source) => {
  const extension = path.extname(filename).toLowerCase()
  if (scripts.has(extension)) return codeHits(filename, source, 0, source, true)
  if (extension === ".css") return cssHits(filename, source, 1)
  if (extension === ".yml" || extension === ".yaml") return yamlHits(filename, source)
  if (extension === ".astro") return astroHits(filename, source)
  return []
}
