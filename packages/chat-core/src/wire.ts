import type { ChatDeps } from "./api.js"

export type RouteRequest = {
  readonly params: Readonly<Record<string, string>>
  readonly query: Readonly<Record<string, string>>
  readonly body: unknown
}

export type Read<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly refusal: string }

export type Reader<Value> = (request: RouteRequest) => Read<Value> | Promise<Read<Value>>

export type Route<Value> = {
  readonly method: "GET" | "POST" | "ALL"
  readonly path: string
  readonly read: Reader<Value>
}

export type HandlerContext = {
  readonly deps: ChatDeps
  readonly request: Request
}

export type Handler<Value> = (input: Value, context: HandlerContext) => Response | Promise<Response>

export const readNothing: Reader<undefined> = () => ({ ok: true, value: undefined })

export const notImplemented = (): Response => Response.json({ error: "not implemented" }, { status: 501 })
