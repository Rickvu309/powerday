CREATE VIEW message_text AS
SELECT
  messages.rowid AS key,
  coalesce(
    (
      SELECT group_concat(json_extract(part.value, '$.text'), ' ')
      FROM json_each(messages.body, '$.parts') AS part
      WHERE json_extract(part.value, '$.type') = 'text'
    ),
    ''
  ) AS text
FROM messages;

CREATE VIRTUAL TABLE title_search USING fts5 (
  title,
  content = 'conversations',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE message_search USING fts5 (
  text,
  content = 'message_text',
  content_rowid = 'key',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER title_search_insert AFTER INSERT ON conversations BEGIN
  INSERT INTO title_search (rowid, title) VALUES (new.rowid, new.title);
END;

CREATE TRIGGER title_search_update AFTER UPDATE OF title ON conversations BEGIN
  INSERT INTO title_search (title_search, rowid, title) VALUES ('delete', old.rowid, old.title);
  INSERT INTO title_search (rowid, title) VALUES (new.rowid, new.title);
END;

CREATE TRIGGER title_search_delete AFTER DELETE ON conversations BEGIN
  INSERT INTO title_search (title_search, rowid, title) VALUES ('delete', old.rowid, old.title);
END;

CREATE TRIGGER message_search_insert AFTER INSERT ON messages BEGIN
  INSERT INTO message_search (rowid, text) SELECT key, text FROM message_text WHERE key = new.rowid;
END;

CREATE TRIGGER message_search_unindex BEFORE UPDATE OF body ON messages BEGIN
  INSERT INTO message_search (message_search, rowid, text)
  SELECT 'delete', key, text FROM message_text WHERE key = old.rowid;
END;

CREATE TRIGGER message_search_reindex AFTER UPDATE OF body ON messages BEGIN
  INSERT INTO message_search (rowid, text) SELECT key, text FROM message_text WHERE key = new.rowid;
END;

CREATE TRIGGER message_search_delete BEFORE DELETE ON messages BEGIN
  INSERT INTO message_search (message_search, rowid, text)
  SELECT 'delete', key, text FROM message_text WHERE key = old.rowid;
END;
