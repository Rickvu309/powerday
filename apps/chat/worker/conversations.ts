import {
  Conversation,
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
          `SELECT messages.body FROM messages JOIN conversations ON conversations.id = messages.conversation
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
           ON CONFLICT (id) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at
           WHERE conversations.owner = excluded.owner`,
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
          `DELETE FROM messages WHERE conversation = ?1
           AND id NOT IN (SELECT value FROM json_each(?2))
           AND EXISTS (SELECT 1 FROM conversations WHERE id = ?1 AND owner = ?3)`,
        )
        .bind(id, JSON.stringify(messages.map((message) => message.id)), owner),
      ...messages.map((message, position) =>
        db
          .prepare(
            `INSERT INTO messages (id, conversation, position, body)
             SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM conversations WHERE id = ?2 AND owner = ?5)
             ON CONFLICT (id) DO UPDATE SET position = excluded.position, body = excluded.body
             WHERE messages.conversation = excluded.conversation
             AND (messages.position <> excluded.position OR messages.body <> excluded.body)`,
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
           JOIN conversations ON conversations.id = messages.conversation
           WHERE message_search MATCH ?1 AND conversations.owner = ?2
         ),
         top AS MATERIALIZED (
           SELECT ${columns}, max(hits.message) AS message FROM hits JOIN conversations USING (id)
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
