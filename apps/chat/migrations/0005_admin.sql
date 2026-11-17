CREATE TABLE admin_catalog (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL CHECK(json_valid(body)), revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE provider_keys (provider TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, suffix TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE admin_limits (email TEXT PRIMARY KEY, tokens INTEGER NOT NULL CHECK(tokens >= 0));
CREATE TABLE admin_audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX usage_events_by_time ON usage_events(at);
