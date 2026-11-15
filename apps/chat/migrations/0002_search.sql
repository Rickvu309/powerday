CREATE TABLE conversations_scoped (
  id TEXT NOT NULL,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);

CREATE TABLE messages_scoped (
  id TEXT NOT NULL,
  owner TEXT NOT NULL,
  conversation TEXT NOT NULL,
  position INTEGER NOT NULL,
  body TEXT NOT NULL CHECK (json_valid(body)),
  PRIMARY KEY (owner, conversation, id),
  UNIQUE (owner, conversation, position),
  FOREIGN KEY (owner, conversation) REFERENCES conversations_scoped (owner, id) ON DELETE CASCADE
);

INSERT INTO conversations_scoped SELECT id, owner, title, model, created_at, updated_at FROM conversations;
INSERT INTO messages_scoped
SELECT messages.id, conversations.owner, messages.conversation, messages.position, messages.body
FROM messages JOIN conversations ON conversations.id = messages.conversation;
DROP TABLE messages;
DROP TABLE conversations;
ALTER TABLE conversations_scoped RENAME TO conversations;
ALTER TABLE messages_scoped RENAME TO messages;
CREATE INDEX conversations_by_owner ON conversations (owner, updated_at DESC, id DESC);

CREATE VIRTUAL TABLE title_search USING fts5 (
  title,
  content = 'conversations',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE message_search USING fts5 (
  text,
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
  INSERT INTO message_search (rowid, text)
  SELECT new.rowid, coalesce(group_concat(json_extract(part.value, '$.text'), ' '), '')
  FROM json_each(new.body, '$.parts') AS part WHERE json_extract(part.value, '$.type') = 'text';
END;

CREATE TRIGGER message_search_update AFTER UPDATE OF body ON messages BEGIN
  DELETE FROM message_search WHERE rowid = old.rowid;
  INSERT INTO message_search (rowid, text)
  SELECT new.rowid, coalesce(group_concat(json_extract(part.value, '$.text'), ' '), '')
  FROM json_each(new.body, '$.parts') AS part WHERE json_extract(part.value, '$.type') = 'text';
END;

CREATE TRIGGER message_search_delete AFTER DELETE ON messages BEGIN
  DELETE FROM message_search WHERE rowid = old.rowid;
END;

INSERT INTO title_search (title_search) VALUES ('rebuild');
INSERT INTO message_search (rowid, text)
SELECT messages.rowid, coalesce((
  SELECT group_concat(json_extract(part.value, '$.text'), ' ')
  FROM json_each(messages.body, '$.parts') AS part WHERE json_extract(part.value, '$.type') = 'text'
), '') FROM messages;
