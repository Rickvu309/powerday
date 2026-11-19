import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { endPeek, holdPeek, leavePeek, peek, peekCloseDelay, peekOpenDelay, readPeek } from "./panel-peek"

describe("panel peek", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    endPeek()
  })
  afterEach(() => {
    endPeek()
    vi.useRealTimers()
  })

  it("opens after a short hover and not on a pass over the rail", () => {
    peek("chat")
    leavePeek()
    vi.advanceTimersByTime(peekOpenDelay * 2)
    expect(readPeek()).toBeNull()

    peek("chat")
    vi.advanceTimersByTime(peekOpenDelay)
    expect(readPeek()).toBe("chat")
  })

  it("switches panels at once while one is open", () => {
    peek("chat")
    vi.advanceTimersByTime(peekOpenDelay)
    peek("office")
    expect(readPeek()).toBe("office")
  })

  it("stays open while the pointer crosses from the rail into the panel", () => {
    peek("office")
    vi.advanceTimersByTime(peekOpenDelay)
    leavePeek()
    vi.advanceTimersByTime(peekCloseDelay - 1)
    holdPeek()
    vi.advanceTimersByTime(peekCloseDelay * 2)
    expect(readPeek()).toBe("office")

    leavePeek()
    vi.advanceTimersByTime(peekCloseDelay)
    expect(readPeek()).toBeNull()
  })
})
