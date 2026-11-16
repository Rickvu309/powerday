import * as z from "zod"

export class ReplyProblem extends Error {
  readonly status: number
  readonly resetsAt: Date | undefined

  constructor(status: number, resetsAt?: Date) {
    super(`Request failed with status ${status}`)
    this.name = "ReplyProblem"
    this.status = status
    this.resetsAt = resetsAt
  }
}

const problemByStatus = new Map([
  [401, "Sign in to continue. Your message is still here."],
  [409, "A reply is already running or saved. Wait for it to finish, reopen that chat, then retry."],
  [404, "This conversation could not be found."],
  [422, "This model is no longer available. Choose another model and retry."],
  [429, "You've reached your usage limit. Try again after it resets."],
  [501, "Replies aren't switched on yet. Try again later."],
])

export const problemOf = (error: unknown) => {
  if (error instanceof TypeError) return "Couldn't reach Power Chat. Check your connection and try again."
  return (
    (error instanceof ReplyProblem ? problemByStatus.get(error.status) : undefined) ??
    "Something went wrong with this reply. Try again."
  )
}

export const usageLimitOf = (error: unknown) =>
  error instanceof ReplyProblem && error.status === 429 ? error : undefined

const LimitResponse = z.object({ resetsAt: z.iso.datetime() })

export const chatFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (!response.ok) {
    const limit =
      response.status === 429 ? LimitResponse.safeParse(await response.json().catch(() => undefined)) : undefined
    throw new ReplyProblem(response.status, limit?.success ? new Date(limit.data.resetsAt) : undefined)
  }
  return response
}
