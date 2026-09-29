-- Bia Bazi D1 baseline.
-- Safe for an already initialized database: all objects are created only when absent.

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

CREATE TABLE IF NOT EXISTS player_game_stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, game_type)
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
  finished_at TEXT,
  deleted_at TEXT,
  cancelled_at TEXT
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
  game_id TEXT,
  placement INTEGER,
  score_delta INTEGER NOT NULL DEFAULT 0,
  rating_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_rating ON player_stats(rating DESC);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating ON player_game_stats(game_type, rating DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_player ON game_results(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_game ON game_results(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rooms_group ON game_rooms(group_chat_id, created_at DESC);
