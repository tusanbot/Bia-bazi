CREATE TABLE IF NOT EXISTS bot_groups (
  chat_id INTEGER PRIMARY KEY,
  title TEXT,
  username TEXT,
  type TEXT NOT NULL DEFAULT 'supergroup',
  member_count INTEGER,
  blocked INTEGER NOT NULL DEFAULT 0,
  bot_status TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  chat_id INTEGER NOT NULL,
  telegram_id INTEGER NOT NULL,
  display_name TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'seen',
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_groups_status ON bot_groups(blocked, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members_seen ON group_members(chat_id, last_seen_at DESC);

ALTER TABLE game_rooms ADD COLUMN group_chat_id INTEGER;
ALTER TABLE game_rooms ADD COLUMN deleted_at TEXT;
ALTER TABLE game_rooms ADD COLUMN cancelled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rooms_group ON game_rooms(group_chat_id, created_at DESC);
