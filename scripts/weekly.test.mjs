import { median, parsePulls, weekly } from "./weekly.mjs"

const same = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}

same("the median of an odd count is the middle", median([5, 1, 3]), 3)
same("the median of an even count is the mean of the middle two", median([4, 1, 3, 2]), 2.5)

const node = (number, login, created, merged, pushes) => ({
  number,
  author: login === null ? null : { login },
  createdAt: created,
  mergedAt: merged,
  timelineItems: { totalCount: pushes },
})
const pulls = parsePulls(
  JSON.stringify({
    data: {
      search: {
        nodes: [
          node(3, "quanvu309", "2026-11-10T00:00:00Z", "2026-11-10T02:00:00Z", 0),
          node(4, "quanvu309", "2026-11-10T00:00:00Z", "2026-11-10T06:00:00Z", 2),
          node(5, null, "2026-11-11T00:00:00Z", "2026-11-11T01:00:00Z", 1),
        ],
      },
    },
  }),
)
same("a deleted author reads as ghost", pulls[2].author, "ghost")

const lines = weekly({ pulls, since: "2026-11-08T00:00:00Z", until: "2026-11-15T00:00:00Z" })
same("the count", lines.includes("PRs merged: 3"), true)
same("the median wait", lines.includes("Median open-to-merge: 2.0 hours"), true)
same(
  "the rebased PRs are named",
  lines.includes("PRs that needed a rebase (force-pushed after opening): 2 (#4, #5)"),
  true,
)
same("authors are ranked by count", lines.slice(-2), ["| quanvu309 | 2 |", "| ghost | 1 |"])
same(
  "an empty week says none merged",
  weekly({ pulls: [], since: "2026-11-08T00:00:00Z", until: "2026-11-15T00:00:00Z" }).includes(
    "Median open-to-merge: none merged",
  ),
  true,
)
