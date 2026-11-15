import { listModels } from "../catalog.js"
import { readNothing, type Handler } from "../wire.js"

export const read = readNothing

export const handle: Handler<undefined> = (_input, { deps }) => Response.json({ models: listModels(deps.catalog) })
