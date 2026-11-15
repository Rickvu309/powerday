import {
  ConversationPage,
  ConversationId,
  createChatApi,
  parseCatalog,
  UserId,
  type ChatDeps,
} from "@powerday/chat-core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { conversationStore } from "./conversations"
import { conversation, localD1, message } from "./local-d1"

let proxy: Awaited<ReturnType<typeof localD1>>
let store: ReturnType<typeof conversationStore>

beforeAll(async () => {
  proxy = await localD1()
  store = conversationStore(proxy.env)
})

afterAll(() => proxy.dispose())

const ada = UserId.parse("ada")
const bob = UserId.parse("bob")
const id = (text: string) => ConversationId.parse(text)

describe("the D1 conversation store", () => {
  it("creates a conversation on its first message and appends later ones in order", async () => {
    await store.save(conversation("ada", "pho", "Phở recipe", 1_000), [message("p1", "user", "How do I cook phở?")])
    await store.save(conversation("ada", "pho", "ignored on update", 2_000), [
      message("p1", "user", "How do I cook phở?"),
      message("p2", "assistant", "Simmer the bones for hours."),
      message("p3", "user", "And the noodles?"),
    ])
    const saved = await store.get(ada, id("pho"))
    expect(saved?.conversation).toMatchObject({ title: "Phở recipe", updatedAt: new Date(2_000) })
    expect(saved?.messages.map((each) => each.id)).toEqual(["p1", "p2", "p3"])
    expect(saved?.messages[1]).toEqual(message("p2", "assistant", "Simmer the bones for hours."))
  })

  it("lists a user's conversations newest first, a page at a time", async () => {
    const owner = UserId.parse("pager")
    for (let index = 0; index < 120; index += 1) {
      await store.save(conversation("pager", `page-${index}`, `Chat ${index}`, 10_000 + (index % 7) * 1000), [])
    }
    const first = await store.list(owner, undefined)
    const second = await store.list(owner, {
      updatedAt: first.conversations[49]!.updatedAt,
      id: first.conversations[49]!.id,
    })
    expect(first.conversations).toHaveLength(50)
    expect(first.next).toBe(`${first.conversations[49]!.updatedAt.getTime()}.${first.conversations[49]!.id}`)
    const all = [...first.conversations, ...second.conversations]
    const times = all.map((each) => each.updatedAt.getTime())
    expect(times).toEqual(times.toSorted((a, b) => b - a))
    expect(new Set(all.map((each) => each.id)).size).toBe(100)
  })

  it("isolates identical client conversation and message ids by owner", async () => {
    await store.save(conversation("ada", "secret", "Ada's plans", 3_000), [message("s1", "user", "launch codes 1234")])
    expect(await store.get(bob, id("secret"))).toBeUndefined()
    expect(await store.rename(bob, id("secret"), "mine now")).toBe(false)
    expect(await store.delete(bob, id("secret"))).toBe(false)
    await store.save(conversation("bob", "secret", "Bob's plans", 9_000), [message("s1", "user", "Bob's groceries")])
    await store.save(conversation("bob", "secret", "ignored", 10_000), [
      message("s1", "user", "Bob's groceries"),
      message("s2", "assistant", "Buy milk"),
    ])
    await store.save(conversation("bob", "mine", "Bob's other chat", 9_000), [message("s1", "user", "Different chat")])
    expect((await store.get(bob, id("secret")))?.messages).toEqual([
      message("s1", "user", "Bob's groceries"),
      message("s2", "assistant", "Buy milk"),
    ])
    expect((await store.get(bob, id("mine")))?.messages).toEqual([message("s1", "user", "Different chat")])
    expect((await store.list(bob, undefined)).conversations.map((each) => each.id)).toEqual(["secret", "mine"])
    expect(await store.search(bob, "launch")).toEqual([])
    expect((await store.search(ada, "launch")).map((hit) => hit.conversation.owner)).toEqual([ada])
    expect(await store.search(ada, "groceries")).toEqual([])
    expect(await store.rename(bob, id("secret"), "Groceries")).toBe(true)
    expect(await store.delete(bob, id("secret"))).toBe(true)
    const saved = await store.get(ada, id("secret"))
    expect(saved?.conversation).toMatchObject({ owner: "ada", title: "Ada's plans", updatedAt: new Date(3_000) })
    expect(saved?.messages).toEqual([message("s1", "user", "launch codes 1234")])
    expect((await store.search(ada, "launch")).map((hit) => hit.conversation.id)).toEqual(["secret"])
  })

  it("finds conversations by title and message text, ignoring accents and finishing the last word", async () => {
    await store.save(conversation("ada", "trip", "Đà Lạt weekend", 4_000), [
      message("t1", "user", "Plan two days of hiking near the lake"),
    ])
    expect((await store.search(ada, "da lat")).map((each) => each.conversation.id)).toEqual(["trip"])
    const [hit] = await store.search(ada, "hik")
    expect(hit?.conversation.id).toBe("trip")
    expect(hit?.snippet).toContain("hiking")
    expect(await store.search(ada, `" - * ) OR NEAR(`)).toEqual([])
  })

  it("updates indexed message text when a reply changes", async () => {
    await store.save(conversation("ada", "edit", "Draft", 1000), [message("edit1", "assistant", "outdated")])
    await store.save(conversation("ada", "edit", "Draft", 2000), [message("edit1", "assistant", "corrected")])
    expect(await store.search(ada, "outdated")).toEqual([])
    expect((await store.search(ada, "corrected")).map((hit) => hit.conversation.id)).toEqual(["edit"])
  })

  it("renames and deletes, and search follows both", async () => {
    await store.save(conversation("ada", "gone", "Tax questions", 5_000), [
      message("g1", "user", "deductible receipts"),
    ])
    expect(await store.rename(ada, id("gone"), "Taxes 2026")).toBe(true)
    expect(await store.search(ada, "questions")).toEqual([])
    expect((await store.search(ada, "taxes")).map((each) => each.conversation.title)).toEqual(["Taxes 2026"])

    expect(await store.delete(ada, id("gone"))).toBe(true)
    expect(await store.get(ada, id("gone"))).toBeUndefined()
    expect(await store.search(ada, "receipts")).toEqual([])
    expect(await store.delete(ada, id("gone"))).toBe(false)
  })
})

describe("the conversation routes on D1", () => {
  const unused = (): never => {
    throw new Error("a conversation route called an unrelated port")
  }
  const api = () =>
    createChatApi({
      catalog: parseCatalog(proxy.env.CATALOG),
      store,
      ledger: { record: unused, spent: unused, allowance: unused },
      gateway: { model: unused },
      auth: {
        user: async (request) => UserId.optional().parse(request.headers.get("user") ?? undefined),
        handle: unused,
      },
      clock: { now: unused },
      ids: { conversation: unused, message: unused },
      waitUntil: unused,
    } satisfies ChatDeps)

  it("refuses signed-out list, search and read requests", async () => {
    expect((await api().request("/api/conversations")).status).toBe(401)
    expect((await api().request("/api/conversations?q=hello")).status).toBe(401)
    expect((await api().request("/api/conversations/private")).status).toBe(401)
  })

  it("answers 401 when signed out and 404 for another user's conversation", async () => {
    await store.save(conversation("ada", "private", "Ada only", 6_000), [message("v1", "user", "hello")])
    const as = (user: string) => ({ headers: { user } })
    expect((await api().request("/api/conversations/private")).status).toBe(401)
    expect((await api().request("/api/conversations/private", as("bob"))).status).toBe(404)
    expect((await api().request("/api/conversations/private", { method: "DELETE", ...as("bob") })).status).toBe(404)
    const own = await api().request("/api/conversations/private", as("ada"))
    expect(await own.json()).toMatchObject({
      conversation: { id: "private", title: "Ada only" },
      messages: [{ id: "v1" }],
    })
  })

  it("pages and searches through the session user and deletes through the API", async () => {
    const headers = { user: "pager" }
    const first = ConversationPage.parse(await (await api().request("/api/conversations", { headers })).json())
    expect(first.conversations).toHaveLength(50)
    const second = ConversationPage.parse(
      await (await api().request(`/api/conversations?before=${first.next}`, { headers })).json(),
    )
    expect(second.conversations).toHaveLength(50)
    expect(new Set([...first.conversations, ...second.conversations].map((each) => each.id)).size).toBe(100)
    const found = await (await api().request("/api/conversations?q=launch", { headers: { user: "bob" } })).json()
    expect(found).toEqual({ found: [] })
    expect((await api().request("/api/conversations?before=invalid", { headers })).status).toBe(400)
    await store.save(conversation("ada", "delete-route", "Delete me", 7000), [])
    expect(
      (await api().request("/api/conversations/delete-route", { method: "DELETE", headers: { user: "ada" } })).status,
    ).toBe(204)
    expect(await store.get(ada, id("delete-route"))).toBeUndefined()
    expect(
      (
        await api().request("/api/conversations/private", {
          method: "PATCH",
          headers: { user: "bob" },
          body: JSON.stringify({ title: "Stolen" }),
        })
      ).status,
    ).toBe(404)
    for (const method of ["PATCH", "DELETE"]) {
      expect(
        (
          await api().request("/api/conversations/private", {
            method,
            body: method === "PATCH" ? JSON.stringify({ title: "No session" }) : null,
          })
        ).status,
      ).toBe(401)
    }
  })

  it("renames through PATCH and refuses an empty title", async () => {
    await store.save(conversation("ada", "named", "Old name", 7_000), [])
    const patch = (title: string) =>
      api().request("/api/conversations/named", {
        method: "PATCH",
        headers: { user: "ada" },
        body: JSON.stringify({ title }),
      })
    expect((await patch("   ")).status).toBe(400)
    expect((await patch("  New name ")).status).toBe(204)
    expect((await store.get(ada, id("named")))?.conversation.title).toBe("New name")
  })
})

it("migrates saved history and backfills title and message search", async () => {
  const upgraded = await localD1(async (db) => {
    await db.batch([
      db.prepare("INSERT INTO conversations VALUES ('legacy', 'ada', 'Before migration', 'mock', 1000, 2000)"),
      db
        .prepare(`INSERT INTO messages VALUES ('old1', 'legacy', 0, ?1)`)
        .bind(JSON.stringify(message("old1", "user", "Legacy hiking"))),
      db
        .prepare(`INSERT INTO messages VALUES ('old2', 'legacy', 1, ?1)`)
        .bind(JSON.stringify(message("old2", "assistant", "Bring boots"))),
    ])
  })
  try {
    const migrated = conversationStore(upgraded.env)
    expect((await migrated.get(ada, id("legacy")))?.messages.map((each) => each.id)).toEqual(["old1", "old2"])
    expect((await migrated.search(ada, "migration")).map((hit) => hit.conversation.id)).toEqual(["legacy"])
    expect((await migrated.search(ada, "hiking")).map((hit) => hit.conversation.id)).toEqual(["legacy"])
    await migrated.save(conversation("bob", "legacy", "Bob's new chat", 3000), [message("old1", "user", "Bob only")])
    expect((await migrated.get(ada, id("legacy")))?.messages).toHaveLength(2)
    expect(await migrated.delete(bob, id("legacy"))).toBe(true)
    expect((await migrated.get(ada, id("legacy")))?.messages).toHaveLength(2)
  } finally {
    await upgraded.dispose()
  }
})
