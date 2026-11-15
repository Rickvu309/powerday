import type { UserId } from "./ids.js"

export type Auth = {
  readonly user: (request: Request) => Promise<UserId | undefined>
  readonly handle: (request: Request) => Promise<Response>
}
