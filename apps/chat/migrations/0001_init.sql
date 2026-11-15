CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX conversations_by_owner ON conversations (owner, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  body TEXT NOT NULL CHECK (json_valid(body)),
  UNIQUE (conversation, position)
);

CREATE TABLE usage_events (
  message TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  conversation TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX usage_events_by_user ON usage_events (user, at);

CREATE TABLE allowances (
  user TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK (period IN ('day', 'month')),
  tokens INTEGER NOT NULL CHECK (tokens >= 0)
);

CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  input_microdollars_per_million INTEGER NOT NULL,
  cached_input_microdollars_per_million INTEGER NOT NULL,
  output_microdollars_per_million INTEGER NOT NULL
);
