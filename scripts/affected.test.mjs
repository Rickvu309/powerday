import { affected, inScope, scopeFrom, scopeValue, workspaceGraph } from "./affected.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

const graph = [
  { dir: "apps/chat", name: "@powerday/chat", uses: ["@powerday/chat-core"] },
  { dir: "apps/landing", name: "@powerday/landing", uses: [] },
  { dir: "packages/chat-core", name: "@powerday/chat-core", uses: [] },
]

const cases = [
  ["a landing change runs only the landing", ["apps/landing/src/pages/index.astro"], ["apps/landing"]],
  ["a chat change runs only the chat", ["apps/chat/src/app.tsx"], ["apps/chat"]],
  [
    "a chat-core change also runs the chat that uses it",
    ["packages/chat-core/src/usage.ts"],
    ["apps/chat", "packages/chat-core"],
  ],
  ["a browser test belongs to the chat", ["tests/browser/shell.spec.ts"], ["apps/chat"]],
  ["docs and brand files run no workspace", ["docs/goals.md", "AGENTS.md", "Assets/logo.svg"], []],
  ["the lockfile runs everything", ["pnpm-lock.yaml", "apps/landing/package.json"], "all"],
  ["a script runs everything", ["scripts/check.mjs"], "all"],
  ["a workflow runs everything", [".github/workflows/ci.yml"], "all"],
  ["the PR template runs nothing", [".github/pull_request_template.md"], []],
  ["landing and chat-core together cover every workspace", ["apps/landing/x", "packages/chat-core/x"], "all"],
]
for (const [what, files, expected] of cases) same(what, affected({ files, graph }), expected)

same("unset POWERDAY_ONLY runs everything", scopeFrom({}), "all")
same("an empty POWERDAY_ONLY runs everything", scopeFrom({ POWERDAY_ONLY: "" }), "all")
same("none runs no workspace", scopeFrom({ POWERDAY_ONLY: "none" }), [])
same("a list is read", scopeFrom({ POWERDAY_ONLY: "apps/chat packages/chat-core" }), [
  "apps/chat",
  "packages/chat-core",
])
for (const scope of ["all", [], ["apps/landing"]]) {
  same(`${JSON.stringify(scope)} survives the env round trip`, scopeFrom({ POWERDAY_ONLY: scopeValue(scope) }), scope)
}
same("a landing scope leaves the chat out", inScope(["apps/landing"], "apps/chat"), false)

const real = workspaceGraph()
same(
  "the real graph has chat using chat-core",
  real.find((workspace) => workspace.dir === "apps/chat")?.uses.includes("@powerday/chat-core"),
  true,
)
