import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getPlatformProxy } from "wrangler"
import { UserId, type ChatMessage } from "@powerday/chat-core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { conversationStore } from "./conversations"
import { conversation, localD1, message } from "./local-d1"

let proxy: Awaited<ReturnType<typeof localD1>>
beforeAll(async () => {
  proxy = await localD1()
})
afterAll(() => proxy.dispose())

const pending = (id: string): ChatMessage => ({
  id,
  role: "assistant",
  parts: [],
  metadata: { reply: { state: "streaming" } },
})

const complete = (reply: ChatMessage): ChatMessage => ({
  ...reply,
  parts: [{ type: "text", text: "Finished" }],
  metadata: {
    reply: { state: "complete", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, reasoningTokens: 0 } },
  },
})

describe("atomic D1 claims", () => {
  it.each(["identical", "different"])(
    "allows one winner for simultaneous %s turns across store instances",
    async (kind) => {
      const c = conversation("alice", kind, "Original", 1000)
      const stores = [conversationStore(proxy.env), conversationStore(proxy.env)]
      const results = await Promise.all(
        stores.map((store, index) =>
          store.claim(c, message(kind === "identical" ? "m1" : `m${index}`, "user", "Hello"), pending(`a${index}`)),
        ),
      )
      const winners = results.filter((result) => result !== undefined)
      expect(winners).toHaveLength(1)
      expect(winners[0]?.messages).toHaveLength(2)
      expect(await stores[0]?.get(c.owner, c.id)).toEqual(winners[0])
    },
  )

  it("rejects replay and streaming turns without writes, then appends full ordered history after completion", async () => {
    const store = conversationStore(proxy.env)
    const c = conversation("alice", "history", "Original", 1000)
    const user = message("m1", "user", "First")
    const reply = pending("a1")
    expect((await store.claim(c, user, reply))?.messages).toEqual([user, reply])
    const before = await store.get(c.owner, c.id)
    expect(
      await store.claim(
        { ...c, model: c.model, updatedAt: new Date(9000) },
        message("m2", "user", "Blocked"),
        pending("a2"),
      ),
    ).toBeUndefined()
    expect(await store.get(c.owner, c.id)).toEqual(before)
    await store.save(c, [user, complete(reply)])
    expect(await store.claim(c, user, pending("a2"))).toBeUndefined()
    expect(await store.claim(c, message("m2", "user", "Second"), pending("a1"))).toBeUndefined()
    const finished = await store.get(c.owner, c.id)
    expect(finished?.messages).toEqual([user, complete(reply)])
    const second = message("m2", "user", "Second")
    const claimed = await store.claim(
      { ...c, createdAt: new Date(9000), updatedAt: new Date(9000) },
      second,
      pending("a2"),
    )
    expect(claimed?.messages).toEqual([user, complete(reply), second, pending("a2")])
    expect(claimed?.conversation.createdAt).toEqual(c.createdAt)
    expect(claimed?.conversation.updatedAt).toEqual(new Date(9000))
  })

  it("blocks a preexisting streaming reply and leaves rows and search unchanged", async () => {
    const store = conversationStore(proxy.env)
    const c = conversation("alice", "preexisting", "Original", 1000)
    await store.save(c, [pending("old")])
    const before = await store.get(c.owner, c.id)
    expect(
      await store.claim(
        { ...c, title: "Replacement", updatedAt: new Date(9000) },
        message("m1", "user", "unwritten"),
        pending("a1"),
      ),
    ).toBeUndefined()
    expect(await store.get(c.owner, c.id)).toEqual(before)
    expect(await store.search(c.owner, "unwritten")).toEqual([])
  })

  it("allows Alice and Bob to claim the same conversation and message ids independently", async () => {
    const claims = await Promise.all(
      ["alice", "bob"].map((owner) =>
        conversationStore(proxy.env).claim(
          conversation(owner, "private", owner, 1000),
          message("m1", "user", owner),
          pending("a1"),
        ),
      ),
    )
    expect(claims.every((claim) => claim !== undefined)).toBe(true)
    for (const owner of ["alice", "bob"]) {
      const c = conversation(owner, "private", owner, 1000)
      expect((await conversationStore(proxy.env).get(c.owner, c.id))?.messages).toEqual([
        message("m1", "user", owner),
        pending("a1"),
      ])
      expect(
        await conversationStore(proxy.env).search(UserId.parse(owner), owner === "alice" ? "bob" : "alice"),
      ).toEqual([])
    }
  })

  it("preserves a concurrent rename through claim and completion", async () => {
    const store = conversationStore(proxy.env)
    const other = conversationStore(proxy.env)
    const c = conversation("alice", "rename-claim", "Original", 1000)
    await store.save(c, [])
    const [claimed, renamed] = await Promise.all([
      store.claim(c, message("m1", "user", "Hello"), pending("a1")),
      other.rename(c.owner, c.id, "Renamed"),
    ])
    expect(renamed).toBe(true)
    expect(claimed).toBeDefined()
    if (claimed === undefined) throw new Error("claim lost without a competitor")
    await store.save(
      claimed.conversation,
      claimed.messages.map((m) => (m.role === "assistant" ? complete(m) : m)),
    )
    expect((await other.get(c.owner, c.id))?.conversation.title).toBe("Renamed")
  })

  it.each([false, true])(
    "rolls back every write on a constraint failure with existing conversation %s",
    async (existing) => {
      const store = conversationStore(proxy.env)
      const c = conversation("alice", `rollback-${existing}`, "Rollback", 1000)
      const history = existing ? [message("old", "user", "Existing history")] : []
      if (existing) await store.save(c, history)
      const before = await store.get(c.owner, c.id)
      await expect(
        store.claim({ ...c, updatedAt: new Date(9000) }, message("same", "user", "unwrittenrollback"), pending("same")),
      ).rejects.toThrow()
      expect(await store.get(c.owner, c.id)).toEqual(before)
      expect(await store.search(c.owner, "unwrittenrollback")).toEqual([])
      const rows = await proxy.env.DB.prepare("SELECT * FROM messages WHERE owner = ?1 AND conversation = ?2")
        .bind(c.owner, c.id)
        .all()
      expect(rows.results).toHaveLength(history.length)
      expect((await store.claim(c, message("retry", "user", "Retry"), pending("reply")))?.messages).toEqual([
        ...history,
        message("retry", "user", "Retry"),
        pending("reply"),
      ])
    },
  )
})

it.each(["identical", "different"])("serializes %s submits from separate Worker runtimes sharing D1", async (kind) => {
  const directory = await mkdtemp(path.join(tmpdir(), "powerday-claim-"))
  const first = await localD1(undefined, { path: directory })
  const second = await getPlatformProxy<Cloudflare.Env>({
    configPath: path.join(import.meta.dirname, "../wrangler.jsonc"),
    persist: { path: directory },
    remoteBindings: false,
  })
  try {
    const c = conversation("alice", "workers", "Shared DB", 1000)
    const claims = await Promise.all(
      [first, second].map((runtime, index) =>
        conversationStore(runtime.env).claim(
          c,
          message(kind === "identical" ? "m1" : `m${index}`, "user", "Hello"),
          pending(`a${index}`),
        ),
      ),
    )
    const winners = claims.filter((claim) => claim !== undefined)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.messages).toHaveLength(2)
    for (const runtime of [first, second]) {
      expect(await conversationStore(runtime.env).get(c.owner, c.id)).toEqual(winners[0])
    }
  } finally {
    await Promise.all([first.dispose(), second.dispose()])
    await rm(directory, { recursive: true, force: true })
  }
})
