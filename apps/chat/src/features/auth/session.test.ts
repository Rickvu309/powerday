import { afterEach, describe, expect, it, vi } from "vitest"
import { continueWithGoogle, loadAccount, signOut } from "./session"

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
