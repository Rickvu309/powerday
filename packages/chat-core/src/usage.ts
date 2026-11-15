import * as z from "zod"
import type { ModelId } from "./catalog.js"
import type { ConversationId, UserId } from "./ids.js"

const count = z.int().nonnegative()

export const Usage = z
  .strictObject({ inputTokens: count, outputTokens: count, cachedInputTokens: count, reasoningTokens: count })
  .readonly()
export type Usage = z.infer<typeof Usage>

export type UsageEvent = Usage & {
  readonly user: UserId
  readonly conversation: ConversationId
  readonly message: string
  readonly model: ModelId
  readonly at: Date
}

export type Period = "day" | "month"

export type Allowance = {
  readonly user: UserId
  readonly period: Period
  readonly tokens: number
}

export type Decision = { readonly allowed: true } | { readonly allowed: false; readonly resetsAt: Date }

export const periodOf = (period: Period, now: Date): { readonly start: Date; readonly end: Date } => {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  if (period === "month") {
    return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) }
  }
  const day = now.getUTCDate()
  return { start: new Date(Date.UTC(year, month, day)), end: new Date(Date.UTC(year, month, day + 1)) }
}

export const decide = (spent: number, allowance: Allowance, now: Date): Decision =>
  spent < allowance.tokens ? { allowed: true } : { allowed: false, resetsAt: periodOf(allowance.period, now).end }

export type UsageLedger = {
  readonly record: (event: UsageEvent) => Promise<void>
  readonly spent: (user: UserId, since: Date) => Promise<number>
  readonly allowance: (user: UserId) => Promise<Allowance>
}
