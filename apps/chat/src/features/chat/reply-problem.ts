export class ReplyProblem extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.name = "ReplyProblem"
    this.status = status
  }
}

const problemByStatus = new Map([
  [401, "Sign in to continue. Your message is still here."],
  [
    409,
    "A reply is still running or this attempt was already accepted. Reopen this chat to see the saved reply, then retry.",
  ],
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

export const chatFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (!response.ok) throw new ReplyProblem(response.status)
  return response
}
