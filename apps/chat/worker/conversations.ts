import { safeValidateUIMessages } from "ai"
import {
  Conversation,
  MessageMetadata,
  cursorAfter,
  pageSize,
  type ChatMessage,
  type ConversationStore,
  type Found,
} from "@powerday/chat-core"

const columns = "id, owner, title, model, created_at AS createdAt, updated_at AS updatedAt"

type Row = Record<keyof Conversation, unknown>

const conversationOf = (row: Row) => Conversation.parse(row)

const phrase = (word: string, prefix: boolean) => `"${word.replaceAll('"', '""')}"${prefix ? "*" : ""}`

export const matchQuery = (query: string) =>
  query
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .map((word, index, words) => {
      const last = index === words.length - 1
      const withStroke = word.replace(/d/gi, "đ")
      return withStroke === word ? phrase(word, last) : `(${phrase(word, last)} OR ${phrase(withStroke, last)})`
    })
    .join(" AND ")

export const conversationStore = ({ DB: db }: Cloudflare.Env): ConversationStore => ({
  claim: async (conversation, message, reply) => {
    const { id, owner } = conversation
    const [claimed, , history] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `INSERT INTO conversations (id, owner, title, model, created_at, updated_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6
           WHERE NOT EXISTS (
             SELECT 1 FROM messages WHERE owner = ?2 AND conversation = ?1
             AND (id IN (?7, ?8) OR json_extract(body, '$.metadata.reply.state') = 'streaming')
           )
           ON CONFLICT (owner, id) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at
           RETURNING ${columns}`,
        )
        .bind(
          id,
          owner,
          conversation.title,
          conversation.model,
          conversation.createdAt.getTime(),
          conversation.updatedAt.getTime(),
          message.id,
          reply.id,
        ),
      db
        .prepare(
          `INSERT INTO messages (id, owner, conversation, position, body)
           SELECT json_extract(pair.value, '$.id'), ?2, ?1,
             (SELECT coalesce(max(position), -1) + 1 FROM messages WHERE owner = ?2 AND conversation = ?1) + pair.key,
             pair.value
           FROM json_each(?3) AS pair WHERE changes() = 1`,
        )
        .bind(id, owner, JSON.stringify([message, reply])),
      db
        .prepare(`SELECT body FROM messages WHERE owner = ?2 AND conversation = ?1 AND changes() = 2 ORDER BY position`)
        .bind(id, owner),
    ])
    const row = claimed?.results[0]
    if (row === undefined) return undefined
    const messages: unknown[] = (history?.results ?? []).map((each) => JSON.parse(String(each.body)))
    const validated = await safeValidateUIMessages<ChatMessage>({
      messages,
      metadataSchema: MessageMetadata.optional(),
    })
    if (!validated.success) throw validated.error
    return { conversation: Conversation.parse(row), messages: validated.data }
  },
  list: async (owner, before) => {
    const rows = await db
      .prepare(
        `SELECT ${columns} FROM conversations
         WHERE owner = ?1 AND (?2 IS NULL OR (updated_at, id) < (?2, ?3))
         ORDER BY updated_at DESC, id DESC LIMIT ?4`,
      )
      .bind(owner, before?.updatedAt.getTime() ?? null, before?.id ?? null, pageSize + 1)
      .all<Row>()
    const conversations = rows.results.slice(0, pageSize).map(conversationOf)
    const last = conversations.at(-1)
    return rows.results.length > pageSize && last ? { conversations, next: cursorAfter(last) } : { conversations }
  },

  get: async (owner, id) => {
    const [found, messages] = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${columns} FROM conversations WHERE id = ?1 AND owner = ?2`).bind(id, owner),
      db
        .prepare(
          `SELECT messages.body FROM messages JOIN conversations ON conversations.id = messages.conversation AND conversations.owner = messages.owner
           WHERE messages.conversation = ?1 AND conversations.owner = ?2 ORDER BY messages.position`,
        )
        .bind(id, owner),
    ])
    const row = found?.results[0]
    if (row === undefined) return undefined
    return {
      conversation: conversationOf(row as Row),
      messages: (messages?.results ?? []).map((message) => JSON.parse(String(message.body)) as ChatMessage),
    }
  },

  save: async (conversation, messages) => {
    const { id, owner } = conversation
    await db.batch([
      db
        .prepare(
          `INSERT INTO conversations (id, owner, title, model, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (owner, id) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          owner,
          conversation.title,
          conversation.model,
          conversation.createdAt.getTime(),
          conversation.updatedAt.getTime(),
        ),
      db
        .prepare(
          `DELETE FROM messages WHERE conversation = ?1 AND owner = ?3
           AND id NOT IN (SELECT value FROM json_each(?2))`,
        )
        .bind(id, JSON.stringify(messages.map((message) => message.id)), owner),
      ...messages.map((message, position) =>
        db
          .prepare(
            `INSERT INTO messages (id, conversation, position, body, owner)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (owner, conversation, id) DO UPDATE SET position = excluded.position, body = excluded.body
             WHERE messages.position <> excluded.position OR messages.body <> excluded.body`,
          )
          .bind(message.id, id, position, JSON.stringify(message), owner),
      ),
    ])
  },

  rename: async (owner, id, title) => {
    const result = await db
      .prepare("UPDATE conversations SET title = ?3 WHERE id = ?1 AND owner = ?2")
      .bind(id, owner, title)
      .run()
    return result.meta.changes > 0
  },

  delete: async (owner, id) => {
    const result = await db.prepare("DELETE FROM conversations WHERE id = ?1 AND owner = ?2").bind(id, owner).run()
    return result.meta.changes > 0
  },

  search: async (owner, query) => {
    const match = matchQuery(query)
    if (match === "") return []
    const rows = await db
      .prepare(
        `WITH hits AS (
           SELECT conversations.id AS id, NULL AS message FROM title_search
           JOIN conversations ON conversations.rowid = title_search.rowid
           WHERE title_search MATCH ?1 AND conversations.owner = ?2
           UNION ALL
           SELECT messages.conversation, messages.rowid FROM message_search
           JOIN messages ON messages.rowid = message_search.rowid
           JOIN conversations ON conversations.id = messages.conversation AND conversations.owner = messages.owner
           WHERE message_search MATCH ?1 AND conversations.owner = ?2
         ),
         top AS MATERIALIZED (
           SELECT ${columns}, max(hits.message) AS message FROM hits JOIN conversations USING (id)
           WHERE conversations.owner = ?2
           GROUP BY id ORDER BY updated_at DESC LIMIT 20
         ),
         snippets AS MATERIALIZED (
           SELECT rowid AS message, snippet(message_search, 0, '', '', '…', 16) AS snippet FROM message_search
           WHERE message_search MATCH ?1 AND rowid IN (SELECT message FROM top)
         )
         SELECT id, owner, title, model, createdAt, updatedAt, coalesce(snippets.snippet, '') AS snippet
         FROM top LEFT JOIN snippets USING (message) ORDER BY updatedAt DESC`,
      )
      .bind(match, owner)
      .all<Row & { snippet: string }>()
    return rows.results.map(({ snippet, ...row }): Found => ({ conversation: conversationOf(row), snippet }))
  },
})
