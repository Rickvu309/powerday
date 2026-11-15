import { describe, expect, it } from "vitest"
import type { UserId } from "./ids.js"
import { decide, periodOf, type Allowance } from "./usage.js"

const user = "u1" as UserId
const daily: Allowance = { user, period: "day", tokens: 1000 }
const monthly: Allowance = { user, period: "month", tokens: 1000 }
const now = new Date("2026-12-31T22:15:00Z")

describe("decide", () => {
  it("allows a user under their allowance", () => {
    expect(decide(999, daily, now)).toEqual({ allowed: true })
  })

  it("refuses a user who reached their daily allowance until the next UTC midnight", () => {
    expect(decide(1000, daily, now)).toEqual({ allowed: false, resetsAt: new Date("2027-01-01T00:00:00Z") })
  })

  it("refuses a user over their monthly allowance until the first of next month", () => {
    expect(decide(1500, monthly, new Date("2026-02-14T08:00:00Z"))).toEqual({
      allowed: false,
      resetsAt: new Date("2026-03-01T00:00:00Z"),
    })
  })
})

describe("periodOf", () => {
  it("starts a day at UTC midnight and a month on its first day", () => {
    expect(periodOf("day", now)).toEqual({
      start: new Date("2026-12-31T00:00:00Z"),
      end: new Date("2027-01-01T00:00:00Z"),
    })
    expect(periodOf("month", now)).toEqual({
      start: new Date("2026-12-01T00:00:00Z"),
      end: new Date("2027-01-01T00:00:00Z"),
    })
  })
})
