ALTER TABLE messages ADD COLUMN lease_until INTEGER;
ALTER TABLE messages ADD COLUMN reserved_tokens INTEGER;
ALTER TABLE messages ADD COLUMN reserved_at INTEGER;
