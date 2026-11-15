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

const removals = (comments, containers) => {
  const ranges = comments.map((comment) => {
    const container = containers.find((node) => node.start <= comment.start && comment.end <= node.end)
    return {
      start: container?.start ?? comment.start,
      end: container?.end ?? comment.end,
      jsx: container !== undefined,
    }
  })
  const unique = ranges.filter(
    (range, index) => ranges.findIndex((other) => other.start === range.start && other.end === range.end) === index,
  )
  return unique
    .filter((range) => !unique.some((other) => other !== range && other.start <= range.start && range.end <= other.end))
    .toSorted((first, second) => second.start - first.start)
}

export const stripComments = (filename, source) => {
  const parsed = parseSync(filename, source)
  let text = source
  for (const { start, end, jsx } of removals(parsed.comments, emptyContainers(parsed.program))) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const newline = text.indexOf("\n", end)
    const lineEnd = newline === -1 ? text.length : newline
    if (blank(text.slice(lineStart, start)) && blank(text.slice(end, lineEnd))) {
      text = text.slice(0, lineStart) + text.slice(lineEnd + 1)
    } else {
      const stand = jsx || blank(text.slice(end, lineEnd)) ? "" : text.slice(start, end).includes("\n") ? "\n" : " "
      text = text.slice(0, start).replace(/[ \t]+$/u, "") + stand + text.slice(end).replace(/^[ \t]+/u, "")
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
