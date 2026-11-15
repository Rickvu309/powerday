import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const harness = path.join(path.dirname(fileURLToPath(import.meta.url)), "harness.js")

const wrong = `
import { expectAccepts, expectRejects } from ${JSON.stringify(harness)}
const rule = { "powerday/no-comments": "error" }
expectRejects("right reject", "a.ts", "export const a = 1 // x\\n", rule, "Remove this comment.")
expectRejects("wrong text", "b.ts", "export const a = 1 // x\\n", rule, "nonsense")
expectRejects("clean file rejected", "c.ts", "export const a = 1\\n", rule, "Remove this comment.")
expectRejects("syntax error rejected", "d.ts", "export const = ;\\n", rule, "Remove this comment.")
expectAccepts("right accept", "e.ts", "export const a = 1\\n", rule)
expectAccepts("commented accepted", "f.ts", "export const a = 1 // x\\n", rule)
expectAccepts("syntax error accepted", "g.ts", "export const = ;\\n", rule)
`

const ran = spawnSync(process.execPath, ["--input-type=module", "-e", wrong], { encoding: "utf8" })
const report = `${ran.stdout}${ran.stderr}`

if (ran.status === 0) throw new Error("a batch with wrong expectations passed")
for (const name of [
  "wrong text",
  "clean file rejected",
  "syntax error rejected",
  "commented accepted",
  "syntax error accepted",
]) {
  if (!report.includes(`${name}\nexpected`)) throw new Error(`the batch did not report ${name}\n${report}`)
}
for (const name of ["right reject", "right accept"]) {
  if (report.includes(`${name}\nexpected`)) throw new Error(`the batch reported ${name}, which is right\n${report}`)
}
