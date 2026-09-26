CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  status TEXT NOT NULL,
  group_chat_id INTEGER,
  group_message_id INTEGER,
  creator_telegram_id INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  telegram_id INTEGER NOT NULL,
  seat INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,
  PRIMARY KEY (room_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES game_rooms(id),
  telegram_id INTEGER NOT NULL,
  placement INTEGER,
  score_delta INTEGER NOT NULL DEFAULT 0,
  rating_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_rating ON player_stats(rating DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_player ON game_results(telegram_id, created_at DESC);