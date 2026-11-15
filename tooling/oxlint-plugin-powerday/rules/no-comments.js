const suppression = /(?:eslint-disable|oxlint-disable)\b/u
const expectError = /^@ts-expect-error(?:\s|:|$)/u

const sourceCodeOf = (context) => context.sourceCode ?? context.getSourceCode?.()

const filenameOf = (context) => context.filename ?? context.getFilename?.() ?? ""

const linesOf = (comment) =>
  comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/u, "").trim())
    .filter((line) => line.length > 0)

const isTsExpectError = (comment) => {
  const lines = linesOf(comment)
  return lines.length === 1 && expectError.test(lines[0])
}

const allowsTsExpectError = (filename) => filename.endsWith(".proof.ts")

const messageFor = (comment) => {
  if (suppression.test(comment.value)) {
    return "Remove this suppression. eslint-disable and oxlint-disable are comments, and comments are not allowed."
  }
  if (isTsExpectError(comment)) {
    return "Remove @ts-expect-error. It is allowed only in a *.proof.ts file."
  }
  return "Remove this comment."
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject comments, including eslint-disable and oxlint-disable. Allow @ts-expect-error only in *.proof.ts.",
    },
  },
  create(context) {
    const filename = filenameOf(context)
    return {
      Program() {
        const sourceCode = sourceCodeOf(context)
        for (const comment of sourceCode.getAllComments()) {
          if (isTsExpectError(comment) && allowsTsExpectError(filename)) continue
          context.report({ loc: comment.loc, message: messageFor(comment) })
        }
      },
    }
  },
}

export default rule
