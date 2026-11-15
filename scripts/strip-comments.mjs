import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseSync } from "oxc-parser"

const blank = (text) => text.trim() === ""

const emptyContainers = (node, found = []) => {
  if (Array.isArray(node)) for (const child of node) emptyContainers(child, found)
  else if (node && typeof node === "object") {
    if (node.type === "JSXExpressionContainer" && node.expression?.type === "JSXEmptyExpression") found.push(node)
    for (const value of Object.values(node)) if (value && typeof value === "object") emptyContainers(value, found)
  }
  return found
}

export const stripComments = (filename, source) => {
  const parsed = parseSync(filename, source)
  const containers = emptyContainers(parsed.program)
  let text = source
  for (const comment of parsed.comments.toReversed()) {
    const container = containers.find((node) => node.start <= comment.start && comment.end <= node.end)
    const start = container?.start ?? comment.start
    const end = container?.end ?? comment.end
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const newline = text.indexOf("\n", end)
    const lineEnd = newline === -1 ? text.length : newline
    if (blank(text.slice(lineStart, start)) && blank(text.slice(end, lineEnd))) {
      text = text.slice(0, lineStart) + text.slice(lineEnd + 1)
    } else {
      text = text.slice(0, start).replace(/[ \t]+$/, "") + text.slice(end)
    }
  }
  return text
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    const source = fs.readFileSync(file, "utf8")
    const stripped = stripComments(file, source)
    if (stripped !== source) fs.writeFileSync(file, stripped)
  }
}
