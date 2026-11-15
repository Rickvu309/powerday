import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const heading = "### Preview"

export const previewUrl = (output) =>
  /Version Preview Alias URL: (https:\/\/\S+)/.exec(output)?.[1] ??
  /Version Preview URL: (https:\/\/\S+)/.exec(output)?.[1]

export const previewLine = ({ app, output }) => {
  if (output === undefined) return `- ${app}: the upload did not run. Read the run log.`
  const url = previewUrl(output)
  if (url !== undefined) return `- ${app}: ${url}`
  return /Worker Version ID/.test(output)
    ? `- ${app}: uploaded, but wrangler printed no preview URL. Turn on preview_urls in its wrangler.jsonc.`
    : `- ${app}: the upload failed. Read the run log.`
}

export const commentBody = ({ results, sha, runUrl }) =>
  [heading, "", `For ${sha.slice(0, 7)}:`, "", ...results.map(previewLine), "", runUrl].join("\n")

export const ownComment = (comments) =>
  comments.find((comment) => comment.user === "github-actions[bot]" && comment.body.startsWith(heading))

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [repository, number, apps, logs] = process.argv.slice(2)
  const results = JSON.parse(apps).map((app) => {
    const file = path.join(logs, `${app}.log`)
    return { app, output: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined }
  })
  const body = commentBody({ results, sha: process.env.HEAD_SHA, runUrl: process.env.RUN_URL })
  const gh = (args) => execFileSync("gh", ["api", ...args], { encoding: "utf8" })
  const comments = gh([
    `repos/${repository}/issues/${number}/comments`,
    "--paginate",
    "--jq",
    ".[] | {id, user: .user.login, body} | @json",
  ])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line))
  const found = ownComment(comments)
  if (found === undefined) gh(["-X", "POST", `repos/${repository}/issues/${number}/comments`, "-f", `body=${body}`])
  else gh(["-X", "PATCH", `repos/${repository}/issues/comments/${found.id}`, "-f", `body=${body}`])
  console.log(body)
}
