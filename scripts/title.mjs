export const titleLimit = 72

const prefixed = (text) => /^\[?wip\b/i.test(text) || /^[a-z]+(?:\([^)]*\))?!?:/.test(text)

export const titleFaults = (title) => {
  const text = String(title ?? "")
  if (text.trim() === "") return ["it is empty"]
  return [
    ...([...text].length > titleLimit ? ["it is too long"] : []),
    ...(/[\r\n]/.test(text) ? ["it is more than one line"] : []),
    ...(/\.\s*$/.test(text) ? ["it ends with a full stop"] : []),
    ...(prefixed(text) ? ["it starts with a prefix like fix: or WIP"] : []),
    ...(/#\d+/.test(text) ? ["it names a pull request number"] : []),
  ]
}

export const titleVerdict = (title) => {
  const faults = titleFaults(title)
  if (faults.length === 0) return undefined
  return `${[...String(title ?? "")].length} characters, limit ${titleLimit}: ${faults.join("; ")}`
}

export const titleAdvice = `Write one line of at most ${titleLimit} characters: an imperative verb, then the one outcome, with no full stop. Put the rest in the body.`

export const hasProof = (body) => /^#{1,6}[ \t]+proof\b/im.test(String(body ?? ""))
