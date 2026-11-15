import { areasOf, changesCi, hasBeforeAfter, verdict } from "./bar.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}
const file = (name, additions = 10) => ({ name, additions })
const image = "## Before / after\n\n![main and this PR](https://example.com/shot.png)\n"

same(
  "a workflow change is labelled changes-ci",
  verdict({ files: [file(".github/workflows/ci.yml")] }).labels.includes("changes-ci"),
  true,
)
same("the PR template does not change ci", changesCi(".github/pull_request_template.md"), false)
same("a check script changes ci", changesCi("scripts/check.mjs"), true)

const ui = [file("apps/chat/src/features/chat/composer.tsx")]
same(
  "a UI change with no section needs a before / after",
  verdict({ files: ui, body: "## Proof\n\nRan it." }).labels.includes("needs-before-after"),
  true,
)
same(
  "a section with an image satisfies it",
  verdict({ files: ui, body: image }).labels.includes("needs-before-after"),
  false,
)
same(
  "a section with only words does not",
  hasBeforeAfter("## Before / after\n\nIt looks better.\n## Not done\n"),
  false,
)
same(
  "an image under a later section does not count",
  hasBeforeAfter("## Before / after\n\n## Not done\n\n![x](y.png)\n"),
  false,
)
same(
  "a landing change is seen",
  verdict({ files: [file("apps/landing/src/pages/index.astro")] }).labels.includes("needs-before-after"),
  true,
)
same(
  "tests, worker code and generated shadcn files are not seen",
  verdict({
    files: [
      file("apps/chat/src/features/chat/chat.test.tsx"),
      file("apps/chat/worker/usage.ts"),
      file("apps/chat/src/components/ui/button.tsx"),
    ],
  }).labels.includes("needs-before-after"),
  false,
)

same(
  "401 hand-written lines are over the limit",
  verdict({ files: [file("apps/chat/worker/usage.ts", 401)] }).labels.includes("over-400-lines"),
  true,
)
same(
  "400 hand-written lines are not",
  verdict({ files: [file("apps/chat/worker/usage.ts", 400)] }).labels.includes("over-400-lines"),
  false,
)
same(
  "lockfiles and generated files do not count",
  verdict({
    files: [
      file("pnpm-lock.yaml", 3000),
      file("apps/chat/src/components/ai-elements/message.tsx", 900),
      file("docs/goals.md", 5),
    ],
  }).labels.includes("over-400-lines"),
  false,
)

same(
  "areas come from areas.json",
  areasOf(["packages/chat-core/src/usage.ts", "apps/chat/migrations/0002.sql", "docs/goals.md"]),
  ["chat-worker", "chat-core", "docs"],
)
same("an exact file area matches", areasOf(["AGENTS.md"]), ["docs"])
same(
  "a label that no longer applies is removed",
  verdict({ files: [file("docs/goals.md")] }).remove.includes("over-400-lines") &&
    !verdict({ files: [file("docs/goals.md")] }).remove.includes("docs"),
  true,
)
