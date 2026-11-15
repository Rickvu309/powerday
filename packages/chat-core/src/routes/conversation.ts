import { ConversationId } from "../ids.js"
import { notImplemented, type Handler, type Reader } from "../wire.js"

export const read: Reader<ConversationId> = ({ params }) => {
  const id = ConversationId.safeParse(params.id)
  return id.success ? { ok: true, value: id.data } : { ok: false, refusal: "id" }
}

export const handle: Handler<ConversationId> = () => notImplemented()
