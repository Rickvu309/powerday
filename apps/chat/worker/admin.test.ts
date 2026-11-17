import { createChatApi, UserId, AdminMutation, AdminOverview, catalogData } from "@powerday/chat-core"
import * as z from "zod"
import { expect, test } from "vitest"
import { localD1 } from "./local-d1"
import { adminAccess } from "./admin-access"
import { adminStore } from "./admin-store"
import { keyVault } from "./key-vault"
import { conversationStore } from "./conversations"
import { usageLedger } from "./usage"
import { catalogConfig } from "../../../packages/chat-core/src/catalog.fixture"

const at = new Date("2026-11-17T12:00:00Z")
const key = "test-provider-key-abcd"

test("encrypts keys with random IVs and refuses missing secrets", async () => {
  const vault = keyVault("test-secret-with-at-least-32-characters")
  const first = await vault.seal(key)
  expect(first).not.toContain(key)
  expect(await vault.seal(key)).not.toBe(first)
  expect(await vault.open(first)).toBe(key)
  await expect(keyVault(undefined).seal(key)).rejects.toThrow()
  await expect(keyVault("different-secret-with-32-characters").open(first)).rejects.toThrow()
})

test("gates admins, seeds catalog, audits writes, enforces limits and aggregates usage", async () => {
  const platform = await localD1()
  try {
    const db = platform.env.DB
    await db
      .prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind("owner", "Owner", "owner@example.com", 0, 0)
      .run()
    const user = UserId.parse("owner")
    for (const secret of [undefined, "broken", "{}", '["other@example.com"]'])
      expect(await adminAccess(db, secret).email(user)).toBeUndefined()
    const access = adminAccess(db, '["owner@example.com"]')
    expect(await access.email(user)).toBe("owner@example.com")
    expect(await access.email(UserId.parse("other"))).toBeUndefined()
    const vault = keyVault("test-secret-with-at-least-32-characters")
    const store = adminStore(db, catalogConfig, vault)
    expect(catalogData(await store.read())).toEqual(catalogConfig)
    const deps = {
      catalog: await store.read(),
      catalogSource: store,
      adminStore: store,
      adminAccess: access,
      store: conversationStore(platform.env),
      ledger: usageLedger(platform.env),
      gateway: {
        model: () => {
          throw new Error("No model call expected")
        },
      },
      auth: { user: async () => user, handle: async () => Response.json(null) },
      clock: { now: () => at },
      ids: {
        conversation: () => {
          throw new Error("unused")
        },
        message: () => crypto.randomUUID(),
      },
      waitUntil: () => {},
    }
    const app = createChatApi(deps)
    const denied = createChatApi({ ...deps, adminAccess: adminAccess(db, undefined) })
    expect((await denied.request("/admin")).status).toBe(404)
    expect((await denied.request("/api/admin/overview")).status).toBe(403)
    expect(
      (
        await createChatApi({ ...deps, auth: { ...deps.auth, user: async () => undefined } }).request(
          "/api/admin/overview",
        )
      ).status,
    ).toBe(403)
    const mutate = (input: unknown) =>
      app.request("/api/admin/mutate", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify(input),
      })
    expect((await mutate({ action: "limit", tokens: -1 })).status).toBe(400)
    expect((await app.request("/api/admin/mutate", { method: "POST", body: "{}" })).status).toBe(403)
    expect(
      (await mutate({ action: "provider", provider: { id: "external", kind: "openai", label: "External" }, key }))
        .status,
    ).toBe(200)
    const stored = await db.prepare("SELECT ciphertext FROM provider_keys").first<string>("ciphertext")
    expect(stored).not.toContain(key)
    expect(await vault.open(stored!)).toBe(key)
    const response = await app.request("/api/admin/overview")
    const text = await response.text()
    expect(text).not.toContain(key)
    expect(text).not.toContain(stored!)
    expect(text).toContain("…abcd")
    const model = catalogConfig.models[0]!
    expect((await mutate({ action: "model", model: { ...model, status: "disabled" } })).status).toBe(200)
    expect(
      z
        .object({ models: z.array(z.object({ id: z.string() })) })
        .parse(await (await app.request("/api/models")).json())
        .models.some((m: { id: string }) => m.id === model.id),
    ).toBe(false)
    expect((await mutate({ action: "model", model })).status).toBe(200)
    expect(
      z
        .object({ models: z.array(z.object({ id: z.string() })) })
        .parse(await (await app.request("/api/models")).json())
        .models.some((m: { id: string }) => m.id === model.id),
    ).toBe(true)
    expect((await mutate({ action: "limit", email: "owner@example.com", tokens: 1000 })).status).toBe(200)
    expect(await deps.ledger.allowance(user)).toEqual({ user, period: "day", tokens: 1000 })
    await db
      .prepare("INSERT INTO usage_events VALUES ('used', 'owner', 'c1', ?, 600, 400, 0, 0, ?)")
      .bind(model.id, at.getTime())
      .run()
    const chat = await app.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        id: "c1",
        model: model.id,
        message: { id: "new", role: "user", parts: [{ type: "text", text: "Hi" }] },
      }),
    })
    expect(chat.status).toBe(429)
    await db
      .prepare("INSERT INTO usage_events VALUES ('prior', 'owner', 'c1', ?, 10, 20, 0, 0, ?)")
      .bind(model.id, at.getTime() - 86400000)
      .run()
    const overview = AdminOverview.parse(await (await app.request("/api/admin/overview")).json())
    expect(overview.usage).toEqual([{ email: "owner@example.com", model: model.id, today: 1000, week: 1030 }])
    expect(await db.prepare("SELECT count(*) AS total FROM admin_audit").first("total")).toBe(4)
    expect(await db.prepare("SELECT subject FROM admin_audit WHERE action = 'provider'").first("subject")).toBe(
      "external",
    )
    expect((await mutate({ action: "limit", email: "owner@example.com", tokens: 0 })).status).toBe(200)
    const zero = await app.request("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        id: "zero",
        model: model.id,
        message: { id: "zero-message", role: "user", parts: [{ type: "text", text: "Hi" }] },
      }),
    })
    expect(zero.status).toBe(429)
    expect((await mutate({ action: "remove-provider", id: "external" })).status).toBe(200)
    expect(await db.prepare("SELECT count(*) AS total FROM provider_keys").first("total")).toBe(0)
    const differentSeed = adminStore(db, { providers: [], models: [] }, vault)
    expect(catalogData(await differentSeed.read()).models).toHaveLength(catalogConfig.models.length)
    expect(AdminMutation.safeParse({ action: "limit", tokens: 1000000001 }).success).toBe(false)
  } finally {
    await platform.dispose()
  }
}, 30000)

test("seeds monthly limits and overrides once and uses only D1 thereafter", async () => {
  const platform = await localD1()
  try {
    const db = platform.env.DB
    await db
      .prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 0, 0)')
      .bind("seed-user", "Seed", "seed@example.com")
      .run()
    const user = UserId.parse("seed-user")
    const seed = {
      default: { period: "month", tokens: 1000 },
      overrides: { "seed-user": { period: "month", tokens: 2000 } },
    }
    const store = adminStore(db, catalogConfig, keyVault(undefined), seed)
    await store.read()
    const ledger = usageLedger({ ...platform.env, USAGE_LIMITS: seed })
    expect(await ledger.allowance(user)).toEqual({ user, period: "month", tokens: 2000 })
    expect(await ledger.allowance(UserId.parse("other"))).toEqual({ user: "other", period: "month", tokens: 1000 })
    await store.mutate(
      { action: "limit", email: "seed@example.com", tokens: null },
      "owner@example.com",
      at,
      "delete-limit",
    )
    await store.mutate({ action: "limit", tokens: 0 }, "owner@example.com", at, "zero-limit")
    await adminStore(db, catalogConfig, keyVault(undefined), seed).read()
    expect(await ledger.allowance(user)).toEqual({ user, period: "day", tokens: 0 })
    const overview = AdminOverview.parse(await store.overview(at))
    expect(overview.users).toContainEqual({ email: "seed@example.com", period: "day", tokens: 0 })
  } finally {
    await platform.dispose()
  }
}, 30000)
