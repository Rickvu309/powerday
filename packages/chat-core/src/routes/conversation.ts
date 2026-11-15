import * as z from "zod"
import { Title } from "../conversation.js"
import { ConversationId } from "../ids.js"
import type { Handler, Read, RouteRequest } from "../wire.js"
import { ownerOf, signedOut } from "./conversations.js"

export const read = ({ params }: RouteRequest): Read<ConversationId> => {
  const id = ConversationId.safeParse(params.id)
  return id.success ? { ok: true, value: id.data } : { ok: false, refusal: "id" }
}

export type RenameRequest = { readonly id: ConversationId; readonly title: string }

const RenameBody = z.object({ title: Title })

export const readRename = (request: RouteRequest): Read<RenameRequest> => {
  const id = read(request)
  if (!id.ok) return id
  const body = RenameBody.safeParse(request.body)
  return body.success ? { ok: true, value: { id: id.value, title: body.data.title } } : { ok: false, refusal: "title" }
}

const missing = () => Response.json({ error: "not found" }, { status: 404 })

export const handle: Handler<ConversationId> = async (id, context) => {
  const owner = await ownerOf(context)
  if (owner === undefined) return signedOut()
  const saved = await context.deps.store.get(owner, id)
  return saved ? Response.json(saved) : missing()
}

export const rename: Handler<RenameRequest> = async ({ id, title }, context) => {
  const owner = await ownerOf(context)
  if (owner === undefined) return signedOut()
  return (await context.deps.store.rename(owner, id, title)) ? new Response(null, { status: 204 }) : missing()
}

export const remove: Handler<ConversationId> = async (id, context) => {
  const owner = await ownerOf(context)
  if (owner === undefined) return signedOut()
  return (await context.deps.store.delete(owner, id)) ? new Response(null, { status: 204 }) : missing()
}
