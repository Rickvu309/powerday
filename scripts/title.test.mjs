import { hasProof, titleAdvice, titleFaults, titleLimit, titleVerdict } from "./title.mjs"

const same = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}\n${JSON.stringify(actual)}\n${JSON.stringify(expected)}`)
  }
}

same("the limit is 72", titleLimit, 72)
same("a short imperative title passes", titleFaults("Keep an unsaved Aira chat when the page closes"), [])
same("a title of exactly 72 characters passes", titleFaults("A".repeat(72)), [])
same("a title of 73 characters is too long", titleFaults("A".repeat(73)), ["it is too long"])
same("characters are counted, not bytes", titleFaults(`${"é".repeat(70)}ab`), [])
same("an empty title fails", titleFaults(""), ["it is empty"])
same("a blank title fails", titleFaults("   "), ["it is empty"])
same("a missing title fails", titleFaults(undefined), ["it is empty"])
same("a trailing full stop fails", titleFaults("Add the chat list."), ["it ends with a full stop"])
same("a trailing full stop before spaces fails", titleFaults("Add the chat list. "), ["it ends with a full stop"])
same("a full stop inside passes", titleFaults("Read v1.2 chats"), [])
same("a second line fails", titleFaults("Add the chat list\nand the trash"), ["it is more than one line"])
same("a carriage return fails", titleFaults("Add the chat list\r"), ["it is more than one line"])
for (const title of [
  "fix: the chat list",
  "feat(editor): add undo",
  "chore!: drop node 18",
  "WIP add undo",
  "[WIP] Add undo",
  "wip: undo",
]) {
  same(`a prefix the repo never uses fails: ${title}`, titleFaults(title), ["it starts with a prefix like fix: or WIP"])
}
for (const title of [
  "Note the limit in the dialog",
  "Fix: nothing",
  "Wipe the cache on sign-out",
  "Add undo: one step",
]) {
  same(`a word that only looks like a prefix passes: ${title}`, titleFaults(title), [])
}
same("a pull request number fails", titleFaults("Fix the queue (#99)"), ["it names a pull request number"])
same("a bare number passes", titleFaults("Pin six bugs in 3 specs"), [])
same("faults add up", titleFaults(`fix: ${"a".repeat(80)}.`), [
  "it is too long",
  "it ends with a full stop",
  "it starts with a prefix like fix: or WIP",
])

same("a good title has no verdict", titleVerdict("Add undo"), undefined)
same(
  "a verdict names the length, the limit and the faults",
  titleVerdict(`${"A".repeat(79)}.`),
  "80 characters, limit 72: it is too long; it ends with a full stop",
)
same(
  "a short faulty title still says its length",
  titleVerdict("Add undo."),
  "9 characters, limit 72: it ends with a full stop",
)
same(
  "the advice names the limit and where the rest goes",
  titleAdvice.includes("at most 72 characters") && titleAdvice.includes("body"),
  true,
)

same("a body with a Proof heading has proof", hasProof("## What changes\n\nA.\n\n## Proof\n\nRan it.\n"), true)
same("a Proof heading of any level counts", hasProof("### Proof\nRan it."), true)
same("a body with no Proof heading has none", hasProof("## What changes\n\nA proof of concept.\n"), false)
same("an empty body has none", hasProof(undefined), false)
