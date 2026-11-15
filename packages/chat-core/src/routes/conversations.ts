import { notImplemented, readNothing, type Handler } from "../wire.js"

export const read = readNothing

export const handle: Handler<undefined> = () => notImplemented()
