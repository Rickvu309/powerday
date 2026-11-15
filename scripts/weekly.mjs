import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const day = 24 * 60 * 60 * 1000

const query = `query($search:String!){search(query:$search,type:ISSUE,first:100){nodes{... on PullRequest{number author{login} createdAt mergedAt timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT]){totalCount}}}}}`

export const median = (values) => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const hours = (milliseconds) => `${(milliseconds / 3600000).toFixed(1)} hours`

export const weekly = ({ pulls, since, until }) => {
  const waits = pulls.map((pull) => Date.parse(pull.mergedAt) - Date.parse(pull.createdAt))
  const rebased = pulls.filter((pull) => pull.forcePushes > 0)
  const authors = new Map()
  for (const pull of pulls) authors.set(pull.author, (authors.get(pull.author) ?? 0) + 1)
  const ranked = [...authors].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  return [
    `## Merged ${since.slice(0, 10)} to ${until.slice(0, 10)}`,
    "",
    `PRs merged: ${pulls.length}`,
    `Median open-to-merge: ${pulls.length === 0 ? "none merged" : hours(median(waits))}`,
    `PRs that needed a rebase (force-pushed after opening): ${rebased.length}${rebased.length > 0 ? ` (${rebased.map((pull) => `#${pull.number}`).join(", ")})` : ""}`,
    "",
    "| Author | PRs merged |",
    "| --- | --- |",
    ...ranked.map(([author, count]) => `| ${author} | ${count} |`),
  ]
}

export const parsePulls = (text) =>
  JSON.parse(text).data.search.nodes.map((node) => ({
    number: node.number,
    author: node.author?.login ?? "ghost",
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    forcePushes: node.timelineItems.totalCount,
  }))

const self = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [repository] = process.argv.slice(2)
  const until = new Date().toISOString()
  const since = new Date(Date.parse(until) - 7 * day).toISOString()
  const answer = execFileSync(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `search=repo:${repository} is:pr is:merged merged:>=${since.slice(0, 19)}Z`,
      "-f",
      `query=${query}`,
    ],
    { encoding: "utf8" },
  )
  for (const line of weekly({ pulls: parsePulls(answer), since, until })) console.log(line)
}
