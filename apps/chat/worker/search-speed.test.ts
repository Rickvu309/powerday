import { UserId } from "@powerday/chat-core"
import { afterAll, beforeAll, expect, it } from "vitest"
import { conversationStore } from "./conversations"
import { localD1 } from "./local-d1"

const words = JSON.stringify(
  "phở bún chả hà nội sài gòn đà lạt budget invoice deploy worker database index query cache latency react sidebar model token stream travel weekend hiking recipe noodle coffee market report quarterly forecast meeting agenda contract renewal hiring interview".split(
    " ",
  ),
)

const word = (seed: string) => `json_extract(?2, '$[' || ((${seed}) % json_array_length(?2)) || ']')`

const seed = (db: D1Database, owner: string) =>
  db.batch([
    db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 999)
         INSERT INTO conversations (id, owner, title, model, created_at, updated_at)
         SELECT ?1 || '-' || i, ?1, ${word("i * 7")} || ' ' || ${word("i * 11 + 3")} || ' ' || ${word("i * 13 + 5")},
           'mock', i * 60000, i * 60000 FROM n`,
      )
      .bind(owner, words),
    db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 9999),
           w(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM w WHERE k < 59)
         INSERT INTO messages (owner, id, conversation, position, body)
         SELECT ?1, ?1 || '-m' || i, ?1 || '-' || (i / 10), i % 10,
           json_object('id', ?1 || '-m' || i, 'role', iif(i % 2, 'assistant', 'user'), 'parts', json_array(json_object(
             'type', 'text', 'text',
             (SELECT group_concat(${word("i * 31 + k * 17 + (i * k) % 13")}, ' ') FROM w WHERE k < iif(i % 2, 60, 12))
           )))
         FROM n`,
      )
      .bind(owner, words),
  ])

let proxy: Awaited<ReturnType<typeof localD1>>

beforeAll(async () => {
  proxy = await localD1()
  await seed(proxy.env.DB, "ada")
  await seed(proxy.env.DB, "bob")
}, 60_000)

afterAll(() => proxy.dispose())

it("answers each search over 1,000 saved conversations in under 200 ms on its fastest of five runs", async () => {
  const store = conversationStore(proxy.env)
  const ada = UserId.parse("ada")
  const queries = ["phở", "da lat", "invoice", "react side", "quarterly forecast", "noo", "hiring interview", "x"]
  const wall: number[] = []
  const proxyOnly: number[] = []
  const fastest = new Map<string, number>()
  for (let round = 0; round < 5; round += 1) {
    for (const query of queries) {
      const started = performance.now()
      const found = await store.search(ada, query)
      const took = performance.now() - started
      wall.push(took)
      fastest.set(query, Math.min(fastest.get(query) ?? Infinity, took))
      expect(found.every((hit) => hit.conversation.owner === ada)).toBe(true)
    }
  }
  for (let round = 0; round < 40; round += 1) {
    const started = performance.now()
    await proxy.env.DB.prepare("SELECT 1").run()
    proxyOnly.push(performance.now() - started)
  }
  const at = (timings: number[], share: number) =>
    timings.toSorted((a, b) => a - b)[Math.min(timings.length - 1, Math.floor(timings.length * share))]!.toFixed(1)
  console.info(
    `search, 1,000 chats per user, 2 users, ${wall.length} runs: p50 ${at(wall, 0.5)} ms, p95 ${at(wall, 0.95)} ms, max ${at(wall, 1)} ms; a bare SELECT 1 through the same proxy p50 ${at(proxyOnly, 0.5)} ms`,
  )
  expect((await store.search(ada, "phở")).length).toBe(20)
  expect(Math.max(...fastest.values())).toBeLessThan(200)
}, 30_000)
