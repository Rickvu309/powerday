import fs from "node:fs"
import { plan, superseded } from "./deploy-plan.mjs"
import { commentBody, ownComment, previewLine, previewUrl } from "./preview-comment.mjs"
import { issueAction } from "./red-issue.mjs"

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
const on = { enabled: "true", hasToken: true, fork: false, graph }
const landing = ["apps/landing/src/pages/index.astro"]
const core = ["packages/chat-core/src/usage.ts"]

same("a landing change deploys only the landing", plan({ ...on, mode: "deploy", files: landing }).apps, ["landing"])
same("a chat-core change deploys the chat", plan({ ...on, mode: "deploy", files: core }).apps, ["chat"])
same("unknown changed files deploy every app", plan({ ...on, mode: "deploy", files: undefined }).apps, [
  "landing",
  "chat",
])
same("a docs change deploys nothing", plan({ ...on, mode: "deploy", files: ["docs/goals.md"] }).apps, [])

const unset = plan({ ...on, enabled: undefined, mode: "deploy", files: landing })
same("without DEPLOY_ENABLED nothing deploys", unset.apps, [])
same("and the skip names the variable and the app it would deploy", unset.lines, [
  "deploy skipped: the repo variable DEPLOY_ENABLED is not true. Changed apps: landing.",
])
same("without the token nothing deploys", plan({ ...on, hasToken: false, mode: "deploy", files: landing }).lines, [
  "deploy skipped: the secret CLOUDFLARE_API_TOKEN is not set. Changed apps: landing.",
])

const fork = plan({ ...on, fork: true, mode: "preview", files: landing })
same("a fork gets no preview", fork.apps, [])
same("and is told why", fork.lines[0].includes("from a fork gets no preview"), true)
same("a fork flag does not stop a deploy", plan({ ...on, fork: true, mode: "deploy", files: landing }).apps, [
  "landing",
])

const migrating = ["apps/chat/migrations/0002_usage.sql", ...landing]
same("a preview skips the chat when migrations change", plan({ ...on, mode: "preview", files: migrating }).apps, [
  "landing",
])
same("a deploy still deploys the chat with its migrations", plan({ ...on, mode: "deploy", files: migrating }).apps, [
  "landing",
  "chat",
])

same(
  "a newer commit that changes the chat supersedes the chat deploy",
  superseded({ app: "chat", files: core, graph }),
  true,
)
same("a newer landing commit leaves the chat deploy alone", superseded({ app: "chat", files: landing, graph }), false)
same("main at this commit supersedes nothing", superseded({ app: "landing", files: [], graph }), false)

const uploaded = [
  "Worker Version ID: 1f2e",
  "Version Preview URL: https://1f2e-powerday.example.workers.dev",
  "Version Preview Alias URL: https://pr-7-powerday.example.workers.dev",
].join("\n")
same("the alias URL wins", previewUrl(uploaded), "https://pr-7-powerday.example.workers.dev")
same(
  "an upload with no preview URL says how to turn previews on",
  previewLine({ app: "chat", output: "Worker Version ID: 1f2e\n" }).includes("preview_urls"),
  true,
)
same(
  "a failed upload says so",
  previewLine({ app: "chat", output: "✘ [ERROR] Authentication error" }),
  "- chat: the upload failed. Read the run log.",
)
same("a skipped upload says so", previewLine({ app: "chat", output: undefined }).includes("did not run"), true)
const body = commentBody({ results: [{ app: "landing", output: uploaded }], sha: "abcdef1234", runUrl: "https://run" })
same("the comment names the commit and the URL", body.includes("For abcdef1:") && body.includes("pr-7-powerday"), true)
same(
  "the bot's own comment is found and a person's is not",
  ownComment([
    { id: 1, user: "quanvu309", body: "### Preview\nmine" },
    { id: 2, user: "github-actions[bot]", body },
  ])?.id,
  2,
)

same("a red main opens an issue", issueAction({ result: "failure", open: false }), "open")
same("a red main with an issue open comments", issueAction({ result: "failure", open: true }), "comment")
same("a green main closes the issue", issueAction({ result: "success", open: true }), "close")
same("a cancelled run touches nothing", issueAction({ result: "cancelled", open: true }), "none")

const lock = fs.readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")
const locked = /^ {2}wrangler@([\d.]+):$/m.exec(lock)?.[1]
for (const name of ["deploy.yml", "preview.yml"]) {
  const workflow = fs.readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8")
  same(`${name} pins the wrangler the lockfile pins`, /WRANGLER: wrangler@([\d.]+)/.exec(workflow)?.[1], locked)
}
