import { describe, expect, it, vi, afterEach } from "vitest"
import { chatFetch, problemOf, ReplyProblem, usageLimitOf } from "./reply-problem"

afterEach(() => vi.unstubAllGlobals())

describe("too long replies", () => {
  it("maps 413 without entering the usage reset path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "too long" }, { status: 413 })))
    const error = await chatFetch("/api/chat").catch((error: unknown) => error)
    expect(error).toBeInstanceOf(ReplyProblem)
    expect(problemOf(error)).toBe("This message or chat is too long. Shorten your message or start a new chat.")
    expect(usageLimitOf(error)).toBeUndefined()
    expect(error).toMatchObject({ status: 413, resetsAt: undefined })
  })
})
