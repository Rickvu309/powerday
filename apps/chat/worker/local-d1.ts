import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { ConversationId, ModelId, UserId, type ChatMessage, type Conversation } from "@powerday/chat-core"
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler"

const migrations = path.join(import.meta.dirname, "../migrations")

export const localD1 = async () => {
  const proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: path.join(import.meta.dirname, "../wrangler.jsonc"),
    persist: false,
  })
  for (const file of readdirSync(migrations).sort()) {
    const sql = readFileSync(path.join(migrations, file), "utf8")
    await proxy.env.DB.batch(unstable_splitSqlQuery(sql).map((statement) => proxy.env.DB.prepare(statement)))
  }
  return proxy
}

export const message = (id: string, role: "user" | "assistant", text: string): ChatMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
})

export const conversation = (owner: string, id: string, title: string, at: number): Conversation => ({
  id: ConversationId.parse(id),
  owner: UserId.parse(owner),
  title,
  model: ModelId.parse("mock"),
  createdAt: new Date(at),
  updatedAt: new Date(at),
})
