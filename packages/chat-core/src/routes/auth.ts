import { readNothing, type Handler } from "../wire.js"

export const read = readNothing

export const handle: Handler<undefined> = (_input, { deps, request }) => deps.auth.handle(request)
