import * as z from "zod"
import { Cursor } from "../conversation.js"
import type { Handler, HandlerContext, Reader } from "../wire.js"

export type ConversationsRequest =
  | { readonly kind: "page"; readonly before: Cursor | undefined }
  | { readonly kind: "search"; readonly query: string }

const Query = z.string().trim().min(1).max(200)

export const read: Reader<ConversationsRequest> = ({ query }) => {
  if (query.q !== undefined) {
    const text = Query.safeParse(query.q)
    return text.success ? { ok: true, value: { kind: "search", query: text.data } } : { ok: false, refusal: "q" }
  }
  if (query.before === undefined) return { ok: true, value: { kind: "page", before: undefined } }
  const before = Cursor.safeParse(query.before)
  return before.success ? { ok: true, value: { kind: "page", before: before.data } } : { ok: false, refusal: "before" }
}

export const signedOut = () => Response.json({ error: "signed out" }, { status: 401 })

export const ownerOf = ({ deps, request }: HandlerContext) => deps.auth.user(request)

export const handle: Handler<ConversationsRequest> = async (input, context) => {
  const owner = await ownerOf(context)
  if (input.kind === "search") {
    return Response.json({ found: owner === undefined ? [] : await context.deps.store.search(owner, input.query) })
  }
  return Response.json(owner === undefined ? { conversations: [] } : await context.deps.store.list(owner, input.before))
}
