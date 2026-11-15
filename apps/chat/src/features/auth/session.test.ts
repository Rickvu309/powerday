import { UserId } from "@powerday/chat-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { continueWithGoogle, loadAccount, sameAccount, signOut } from "./session"

afterEach(() => vi.unstubAllGlobals())

describe("account requests", () => {
  it("shows an unavailable state when the session endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 503 })))
    expect(await loadAccount()).toEqual({ status: "unavailable" })
  })

  it("shows an unavailable state when the connection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await loadAccount()).toEqual({ status: "unavailable" })
  })

  it("reports a Google error when the server returns an unreadable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 502 })))
    expect(await continueWithGoogle()).toBe("unfinished")
  })

  it("reports a sign-out failure without claiming the session ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 503 })))
    expect(await signOut()).toBe(false)
  })
})

it("treats a different owner or session as a different account", () => {
  const ada = {
    status: "signed-in",
    userId: UserId.parse("ada"),
    sessionId: "session-ada",
    email: "ada@example.com",
  } as const
  expect(sameAccount(ada, { ...ada })).toBe(true)
  expect(sameAccount(ada, { ...ada, userId: UserId.parse("bob") })).toBe(false)
  expect(sameAccount(ada, { ...ada, sessionId: "another-session" })).toBe(false)
  expect(sameAccount(ada, { status: "signed-out", google: false, failure: undefined })).toBe(false)
})
