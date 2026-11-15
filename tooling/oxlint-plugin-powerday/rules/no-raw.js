const hexDigit = (char) => {
  const code = char ? char.charCodeAt(0) : 0
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102)
}

const word = (char) => {
  const code = char ? char.charCodeAt(0) : 0
  return hexDigit(char) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || code === 95
}

const allowsHex = (filename) => {
  const name = String(filename).replaceAll("\\", "/")
  const base = name.slice(name.lastIndexOf("/") + 1)
  if (base === "tokens.css") return true
  const dot = base.lastIndexOf(".")
  return (dot === -1 ? base : base.slice(0, dot)).endsWith("-art")
}

const at = (source, index) => {
  const line = source.slice(0, index).split("\n").length
  const column = index - source.lastIndexOf("\n", index - 1)
  return { line, column }
}

export const rawExtensions = new Set([".css", ".astro", ".html", ".vue", ".svelte", ".yml", ".yaml", ".svg"])

const banned = "transition-" + "all"
const mixCall = "color-" + "mix("
const hexMessage = "Use a theme token instead of a raw hex."
const mixMessage = "Use a theme token instead of a raw color mix."
const motionMessage = "Name the properties that change."
const sizeMessage = "Use a theme token instead of a sized arbitrary class."
const spaceUtilities = new Set(
  "h min-h max-h w min-w max-w size gap p px py pt pr pb pl m mx my mt mr mb ml".split(" "),
)
const spaceSteps = [4, 8, 12, 16, 24, 32, 48]
const typeSteps = [12, 13, 14, 15, 22, 40]
const radiusSteps = [4.8, 6, 6.4, 8, 10, 11.2, 14, 14.4, 17.6, 20.8]

const nearStep = (value, steps) => {
  let best = 99
  for (const step of steps) best = Math.min(best, Math.round(Math.abs(value - step) * 10))
  return best <= 20
}

const sizedUtility = (source, bracket) => {
  let start = bracket - 1
  while (start > 0) {
    const code = source.charCodeAt(start - 1)
    if (!((code >= 97 && code <= 122) || source[start - 1] === "-")) break
    start -= 1
  }
  return source.slice(start, bracket - 1)
}

const flagSized = (source, findings) => {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[") continue
    let cursor = index + 1
    while (cursor < source.length) {
      const code = source.charCodeAt(cursor)
      if (!((code >= 48 && code <= 57) || source[cursor] === ".")) break
      cursor += 1
    }
    if (cursor === index + 1 || source[index - 1] !== "-") continue
    let unit = ""
    if (source.startsWith("px]", cursor)) unit = "px"
    else if (source.startsWith("rem]", cursor)) unit = "rem"
    else if (source.startsWith("em]", cursor)) unit = "em"
    if (unit === "") continue
    const utility = sizedUtility(source, index)
    const px = Number(source.slice(index + 1, cursor)) * (unit === "px" ? 1 : 16)
    const steps =
      utility === "text"
        ? typeSteps
        : utility.startsWith("rounded")
          ? radiusSteps
          : spaceUtilities.has(utility)
            ? spaceSteps
            : null
    if (steps === null || !nearStep(px, steps)) continue
    findings.push({ ...at(source, index - utility.length - 1), message: sizeMessage })
    index = cursor + unit.length
  }
}

export const rawFindings = (filename, source) => {
  const findings = []
  if (!allowsHex(filename)) {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "#" || hexDigit(source[index - 1])) continue
      let length = 0
      while (length < 8 && hexDigit(source[index + 1 + length])) length += 1
      if ((length !== 8 && length !== 6 && length !== 4 && length !== 3) || hexDigit(source[index + 1 + length])) {
        continue
      }
      findings.push({ ...at(source, index), message: hexMessage })
      index += length
    }
    flagSized(source, findings)
    const folded = source.toLowerCase()
    for (let index = folded.indexOf(mixCall); index !== -1; index = folded.indexOf(mixCall, index + mixCall.length)) {
      findings.push({ ...at(source, index), message: mixMessage })
    }
  }
  for (let index = source.indexOf(banned); index !== -1; index = source.indexOf(banned, index + banned.length)) {
    if (word(source[index - 1]) || word(source[index + banned.length])) continue
    findings.push({ ...at(source, index), message: motionMessage })
  }
  return findings
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject a raw hex, a raw color mix or a near-scale size outside the token file, and name transition properties.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? ""
    return {
      Program() {
        const sourceCode = context.sourceCode ?? context.getSourceCode?.()
        const source = sourceCode?.getText?.() ?? sourceCode?.text ?? ""
        for (const finding of rawFindings(filename, source)) {
          context.report({
            loc: {
              start: { line: finding.line, column: finding.column - 1 },
              end: { line: finding.line, column: finding.column },
            },
            message: finding.message,
          })
        }
      },
    }
  },
}

export default rule
