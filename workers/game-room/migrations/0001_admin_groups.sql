-- Admin panel group tracking.
-- Room columns are handled by the runtime schema repair because older databases may
-- already contain only a subset of those columns.
CREATE TABLE IF NOT EXISTS bot_groups (
  chat_id INTEGER PRIMARY KEY, title TEXT, username TEXT,
  type TEXT NOT NULL DEFAULT 'supergroup', member_count INTEGER,
  blocked INTEGER NOT NULL DEFAULT 0, bot_status TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS group_members (
  chat_id INTEGER NOT NULL, telegram_id INTEGER NOT NULL,
  display_name TEXT, username TEXT, status TEXT NOT NULL DEFAULT 'seen',
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_bot_groups_status ON bot_groups(blocked, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members_seen ON group_members(chat_id, last_seen_at DESC);